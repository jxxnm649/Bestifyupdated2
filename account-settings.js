import { auth } from "./firebase.js";

import {
  onAuthStateChanged,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

const passwordForm = document.getElementById("passwordForm");
const passwordSubmitBtn = document.getElementById("passwordSubmitBtn");

let currentUser = null;

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  currentUser = user;
});

passwordForm.addEventListener("submit", async (e) => {

  e.preventDefault();
  if (!currentUser) return;

  const currentPassword = document.getElementById("currentPassword").value;
  const newPassword = document.getElementById("newPassword").value;

  passwordSubmitBtn.disabled = true;
  passwordSubmitBtn.textContent = "Updating...";

  try {

    const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
    await reauthenticateWithCredential(currentUser, credential);
    await updatePassword(currentUser, newPassword);

    alert("Password updated successfully ✅");
    passwordForm.reset();

  } catch (error) {
    console.error("Password update error:", error);
    alert(error.message || "Failed to update password. Check your current password and try again.");
  } finally {
    passwordSubmitBtn.disabled = false;
    passwordSubmitBtn.textContent = "Update Password";
  }

});
