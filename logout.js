import { auth } from "./firebase.js";

import {
  signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

const logoutBtn = document.getElementById("logoutBtn");

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);

    alert("Logout Successful!");

    window.location.href = "login.html";

  } catch (error) {
    alert(error.message);
  }
});