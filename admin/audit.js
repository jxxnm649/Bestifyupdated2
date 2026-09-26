/* ============================================================
   Bestify Admin — Audit Logging Helper
   Import and call logAdminAction(...) from any admin module
   right after a write (create/update/delete) to keep a trail
   of who did what and when.
   ============================================================ */

import { auth, db } from "../firebase.js";

import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

/**
 * Record an admin action in the `auditLogs` collection.
 * Never throws — logging failures should not break the admin flow.
 *
 * @param {string} action   Short verb phrase, e.g. "Updated order status"
 * @param {string} module   Module name, e.g. "Orders", "Users", "Products"
 * @param {object} details  Extra structured info (target id, before/after, etc.)
 */
export async function logAdminAction(action, module, details = {}) {
  try {
    const user = auth.currentUser;

    await addDoc(collection(db, "auditLogs"), {
      action,
      module,
      details,
      performedBy: user ? (user.email || user.uid) : "Unknown",
      performedByUid: user ? user.uid : null,
      createdAt: serverTimestamp()
    });

  } catch (error) {
    console.error("Audit log write failed:", error);
  }
}
