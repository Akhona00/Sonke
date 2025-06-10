// Firebase Configuration - UPDATE WITH YOUR ACTUAL CONFIG
const firebaseConfig = {
  apiKey: apiKey,
  authDomain: "website-0001-6cc20.firebaseapp.com",
  projectId: "website-0001-6cc20",
  storageBucket: "website-0001-6cc20.firebasestorage.app",
  messagingSenderId: "417090072774",
  appId: "1:417090072774:web:ae3414789c1fdd3f8367c7",
  measurementId: "G-S5LGVGPCYN",
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Contact Service for Firebase
class FirebaseContactService {
  constructor() {
    this.isOnline = navigator.onLine;
    this.setupEventListeners();

    // Enable offline persistence
    db.enablePersistence().catch((err) => {
      if (err.code == "failed-precondition") {
        console.log(
          "Multiple tabs open, persistence can only be enabled in one tab at a time."
        );
      } else if (err.code == "unimplemented") {
        console.log("The current browser does not support offline persistence");
      }
    });
  }

  // Save contact data to Firebase Firestore
  async saveContact(contactData) {
    try {
      // Add timestamp and additional metadata
      const enrichedData = {
        ...contactData,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        submittedAt: new Date().toISOString(), // Client timestamp as backup
        status: "new",
        source: "website_contact_form",
        userAgent: navigator.userAgent,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        referrer: document.referrer || "direct",
      };

      // Add to Firestore
      const docRef = await db.collection("contacts").add(enrichedData);

      console.log("Contact saved with ID:", docRef.id);

      return {
        success: true,
        id: docRef.id,
        message: "Contact saved successfully",
      };
    } catch (error) {
      console.error("Error saving contact:", error);

      // Save to local storage as fallback
      this.saveToLocalStorage(contactData);

      return {
        success: false,
        error: error.message,
        fallback: true,
      };
    }
  }

  // Fallback to local storage
  saveToLocalStorage(contactData) {
    try {
      const existingData = JSON.parse(
        localStorage.getItem("offline_contacts") || "[]"
      );
      existingData.push({
        ...contactData,
        id: Date.now().toString(),
        submittedAt: new Date().toISOString(),
        synced: false,
      });
      localStorage.setItem("offline_contacts", JSON.stringify(existingData));
      console.log("Contact saved to local storage");
    } catch (error) {
      console.error("Failed to save to local storage:", error);
    }
  }

  // Sync offline data when connection is restored
  async syncOfflineData() {
    try {
      const offlineData = JSON.parse(
        localStorage.getItem("offline_contacts") || "[]"
      );
      const unsynced = offlineData.filter((contact) => !contact.synced);

      if (unsynced.length === 0) return;

      console.log(`Syncing ${unsynced.length} offline contacts...`);

      for (const contact of unsynced) {
        try {
          const { id, synced, ...contactData } = contact;
          const result = await this.saveContact(contactData);

          if (result.success) {
            // Mark as synced
            contact.synced = true;
            contact.firebaseId = result.id;
          }
        } catch (error) {
          console.error("Failed to sync contact:", error);
        }
      }

      // Update local storage
      localStorage.setItem("offline_contacts", JSON.stringify(offlineData));
      console.log("Offline data sync completed");
    } catch (error) {
      console.error("Error syncing offline data:", error);
    }
  }

  // Get all contacts (for admin use)
  async getAllContacts() {
    try {
      const snapshot = await db
        .collection("contacts")
        .orderBy("createdAt", "desc")
        .get();

      const contacts = [];
      snapshot.forEach((doc) => {
        contacts.push({
          id: doc.id,
          ...doc.data(),
        });
      });

      return contacts;
    } catch (error) {
      console.error("Error fetching contacts:", error);
      return [];
    }
  }

  // Listen for real-time updates (optional - for admin dashboard)
  listenToContacts(callback) {
    return db
      .collection("contacts")
      .orderBy("createdAt", "desc")
      .onSnapshot((snapshot) => {
        const contacts = [];
        snapshot.forEach((doc) => {
          contacts.push({
            id: doc.id,
            ...doc.data(),
          });
        });
        callback(contacts);
      });
  }

  setupEventListeners() {
    // Sync when coming back online
    window.addEventListener("online", () => {
      this.isOnline = true;
      this.syncOfflineData();
      showNotification("Connection restored. Syncing data...", "info");
    });

    window.addEventListener("offline", () => {
      this.isOnline = false;
      showNotification(
        "You are offline. Data will be saved locally.",
        "warning"
      );
    });
  }
}

// Initialize the Firebase contact service
const contactService = new FirebaseContactService();

// Form submission handling
document.addEventListener("DOMContentLoaded", function () {
  const contactForm = document.getElementById("contactForm");
  const submitBtn = document.querySelector(".submit-btn");

  if (!contactForm || !submitBtn) {
    console.error("Contact form elements not found");
    return;
  }

  contactForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    // Show loading state
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = "Sending... <span>⏳</span>";
    submitBtn.disabled = true;

    try {
      // Get form data
      const formData = new FormData(contactForm);
      const contactData = {
        firstName: formData.get("firstName")?.trim(),
        lastName: formData.get("lastName")?.trim(),
        email: formData.get("email")?.trim(),
        phone: formData.get("phone")?.trim(),
        company: formData.get("company")?.trim(),
        service: formData.get("service"),
        budget: formData.get("budget"),
        message: formData.get("message")?.trim(),
      };

      // Validation
      if (!validateForm(contactData)) {
        return;
      }

      // Save to Firebase
      const result = await contactService.saveContact(contactData);

      if (result.success) {
        showNotification(
          `Thank you ${contactData.firstName}! Your message has been sent successfully. We'll get back to you soon.`,
          "success"
        );
        contactForm.reset();

        // Optional: Google Analytics tracking
        if (typeof gtag !== "undefined") {
          gtag("event", "contact_form_submit", {
            event_category: "engagement",
            event_label: contactData.service || "unknown",
          });
        }
      } else {
        if (result.fallback) {
          showNotification(
            `Thank you ${contactData.firstName}! Your message has been saved and will be sent when connection is restored.`,
            "warning"
          );
          contactForm.reset();
        } else {
          throw new Error(result.error || "Failed to send message");
        }
      }
    } catch (error) {
      console.error("Submission error:", error);
      showNotification(
        "Sorry, there was an error sending your message. Please try again or contact us directly.",
        "error"
      );
    } finally {
      // Reset button
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    }
  });

  // Real-time form validation
  setupFormValidation();
});

// Form validation function
function validateForm(contactData) {
  const requiredFields = ["firstName", "lastName", "email", "message"];
  const missingFields = requiredFields.filter((field) => !contactData[field]);

  if (missingFields.length > 0) {
    showNotification("Please fill in all required fields.", "error");
    return false;
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(contactData.email)) {
    showNotification("Please enter a valid email address.", "error");
    return false;
  }

  // Phone validation (if provided)
  if (contactData.phone && contactData.phone.length > 0) {
    const phoneRegex = /^[\+]?[\d\s\-\(\)]{10,}$/;
    if (!phoneRegex.test(contactData.phone)) {
      showNotification("Please enter a valid phone number.", "error");
      return false;
    }
  }

  return true;
}

// Setup form field validation and animations
function setupFormValidation() {
  const formInputs = document.querySelectorAll("input, select, textarea");

  formInputs.forEach((input) => {
    input.addEventListener("focus", function () {
      this.style.transform = "scale(1.02)";
      this.style.boxShadow = "0 5px 15px rgba(0, 167, 204, 0.2)";
      this.style.borderColor = "#00a7cc";
    });

    input.addEventListener("blur", function () {
      this.style.transform = "scale(1)";
      this.style.boxShadow = "none";

      // Validation on blur
      if (this.hasAttribute("required") && !this.value.trim()) {
        this.style.borderColor = "#ff4444";
      } else if (this.type === "email" && this.value) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        this.style.borderColor = emailRegex.test(this.value)
          ? "#28a745"
          : "#ff4444";
      } else {
        this.style.borderColor = "#ddd";
      }
    });
  });
}

// Notification system
function showNotification(message, type = "info") {
  // Remove existing notifications
  const existingNotifications = document.querySelectorAll(".notification");
  existingNotifications.forEach((notification) => notification.remove());

  // Create notification element
  const notification = document.createElement("div");
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between;">
            <span>${message}</span>
            <button onclick="this.closest('.notification').remove()" 
                    style="margin-left: 15px; background: none; border: none; color: inherit; cursor: pointer; font-size: 20px; padding: 0;">
                &times;
            </button>
        </div>
    `;

  // Styling
  const colors = {
    success: "#28a745",
    error: "#dc3545",
    warning: "#ffc107",
    info: "#17a2b8",
  };

  notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 1000;
        max-width: 400px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        animation: slideIn 0.3s ease;
        background-color: ${colors[type] || colors.info};
    `;

  document.body.appendChild(notification);

  // Auto remove after 6 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.style.animation = "slideOut 0.3s ease";
      setTimeout(() => notification.remove(), 300);
    }
  }, 6000);
}

// Add CSS animations
const style = document.createElement("style");
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Optional: Admin function to view all contacts (for testing)
// Uncomment and use in browser console: viewAllContacts()
/*
async function viewAllContacts() {
    const contacts = await contactService.getAllContacts();
    console.table(contacts);
    return contacts;
}
*/
