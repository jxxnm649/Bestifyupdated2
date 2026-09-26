import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { showToast } from "./design-system.js";

const langOptions = document.getElementById("langOptions");
let currentUser = null;

function markSelected(lang) {
  document.querySelectorAll(".lang-option").forEach(el => {
    el.classList.toggle("selected", el.dataset.lang === lang);
  });
}

langOptions.addEventListener("click", async (e) => {

  const option = e.target.closest(".lang-option");
  if (!option || !currentUser) return;

  const lang = option.dataset.lang;
  markSelected(lang);
  localStorage.setItem("bf_language", lang);

  try {
    await updateDoc(doc(db, "users", currentUser.uid), { language: lang });
    showToast("Language saved", "success");
  } catch (error) {
    console.error("Save language error:", error);
    showToast(error.message || "Failed to save language.", "danger");
  }

});

onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    const lang = userSnap.exists() ? (userSnap.data().language || "en") : "en";
    markSelected(lang);
  } catch (error) {
    console.error("Load language error:", error);
    markSelected("en");
  }

});
