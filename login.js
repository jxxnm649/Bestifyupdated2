import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
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
    alert(error.message);
  }
});
