import { db } from "./firebase.js";

import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

/**
 * Raises a lightweight event alert for the admin panel's Activity feed.
 * Best-effort: failures are logged but never block the user-facing action
 * that triggered them (a failed alert write should never break signup,
 * liking a product, placing an order, etc.).
 */
export async function raiseAdminAlert(type, message, extra = {}) {

  try {

    await addDoc(collection(db, "adminAlerts"), {
      type,
      message,
      read: false,
      createdAt: serverTimestamp(),
      ...extra
    });

  } catch (error) {
    console.error("raiseAdminAlert failed:", error);
  }

}
