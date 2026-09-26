import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const form = document.getElementById("loginForm");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);

    const userDoc = await getDoc(doc(db, "users", credential.user.uid));
    if (userDoc.exists() && userDoc.data().blocked === true) {
      await signOut(auth);
      alert("Your account has been blocked. Please contact support.");
      return;
    }

    alert("Login Successful!");

    // Home page ge hogalu
    window.location.href = "home.html";

  } catch (error) {
    // A blocked account is disabled in Firebase Auth (STEP 1), so it
    // fails here with auth/user-disabled rather than reaching the
    // Firestore "blocked" check above.
    if (error.code === "auth/user-disabled") {
      alert("Your account has been blocked. Please contact support.");
    } else if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email"].includes(error.code)) {
      alert("Incorrect email or password. Please try again.");
    } else if (error.code === "auth/too-many-requests") {
      alert("Too many attempts. Please wait a few minutes, or reset your password.");
    } else {
      alert(error.message);
    }
  }
});


/* ---------- Forgot password ---------- */

const forgotLink = document.getElementById("forgotPasswordLink");

if (forgotLink) {
  forgotLink.addEventListener("click", async (e) => {

    e.preventDefault();

    const emailInput = document.getElementById("email");
    let email = emailInput.value.trim();

    if (!email) {
      email = (window.prompt("Enter your account email to get a password reset link:") || "").trim();
      if (!email) return;
      emailInput.value = email;
    }

    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      if (error.code === "auth/invalid-email") {
        alert("Please enter a valid email address.");
        return;
      }
      if (error.code === "auth/too-many-requests") {
        alert("Too many requests. Please try again in a few minutes.");
        return;
      }
      // Any other error (e.g. no such account) gets the same message
      // as success, so this page can't be used to test which emails
      // are registered.
      console.log("Password reset:", error.code);
    }

    alert(`If an account exists for ${email}, a password reset link has been sent. Please check your inbox and spam folder.`);

  });
}
