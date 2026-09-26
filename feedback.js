import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const feedbackForm = document.getElementById("feedbackForm");
const feedbackSubmitBtn = document.getElementById("feedbackSubmitBtn");

let currentUser = null;

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  currentUser = user;
});

feedbackForm.addEventListener("submit", async (e) => {

  e.preventDefault();
  if (!currentUser) return;

  feedbackSubmitBtn.disabled = true;
  feedbackSubmitBtn.textContent = "Submitting...";

  try {

    await addDoc(collection(db, "feedback"), {
      userId: currentUser.uid,
      userEmail: currentUser.email || "",
      category: document.getElementById("feedbackCategory").value,
      message: document.getElementById("feedbackMessage").value.trim(),
      createdAt: serverTimestamp()
    });

    alert("Thank you for your feedback! 🙏");
    feedbackForm.reset();

  } catch (error) {
    console.error("Feedback submit error:", error);
    alert(error.message || "Failed to submit feedback.");
  } finally {
    feedbackSubmitBtn.disabled = false;
    feedbackSubmitBtn.textContent = "Submit Feedback";
  }

});
