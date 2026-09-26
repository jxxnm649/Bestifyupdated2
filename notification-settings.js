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

const prefOrderUpdates = document.getElementById("prefOrderUpdates");
const prefPromotions = document.getElementById("prefPromotions");
const prefChat = document.getElementById("prefChat");

let currentUser = null;
let loaded = false;

async function saveNotificationPrefs() {

  if (!currentUser || !loaded) return;

  try {

    await updateDoc(doc(db, "users", currentUser.uid), {
      notificationPrefs: {
        orderUpdates: prefOrderUpdates.checked,
        promotions: prefPromotions.checked,
        chat: prefChat.checked
      }
    });

    showToast("Saved", "success");

  } catch (error) {
    console.error("Save notification prefs error:", error);
    showToast(error.message || "Failed to save.", "danger");
  }

}

[prefOrderUpdates, prefPromotions, prefChat].forEach((el) => {
  el.addEventListener("change", saveNotificationPrefs);
});

onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  try {

    const userSnap = await getDoc(doc(db, "users", user.uid));
    const prefs = userSnap.exists() ? (userSnap.data().notificationPrefs || {}) : {};

    prefOrderUpdates.checked = prefs.orderUpdates !== false;
    prefPromotions.checked = prefs.promotions !== false;
    prefChat.checked = prefs.chat !== false;

  } catch (error) {
    console.error("Load notification prefs error:", error);
  } finally {
    loaded = true;
  }

});
