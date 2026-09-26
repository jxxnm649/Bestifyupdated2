import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-functions.js";

import { getSessionId } from "./session-tracker.js";
import { showToast } from "./design-system.js";

const functions = getFunctions();
const revokeAllSessions = httpsCallable(functions, "revokeAllSessions");

const deviceList = document.getElementById("deviceList");
const logoutAllBtn = document.getElementById("logoutAllBtn");

let currentUser = null;
const { id: mySessionId } = getSessionId();

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function formatDate(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return "Just now";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
      " · " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function toMillis(ts) {
  if (!ts) return 0;
  return ts?.toDate ? ts.toDate().getTime() : new Date(ts).getTime();
}

async function loadDevices() {

  try {

    const snapshot = await getDocs(collection(db, "users", currentUser.uid, "sessions"));

    const sessions = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => toMillis(b.lastActiveAt) - toMillis(a.lastActiveAt));

    if (!sessions.length) {
      deviceList.innerHTML = `<div class="bf-card" style="padding:16px;">No device activity recorded yet.</div>`;
      return;
    }

    deviceList.innerHTML = sessions.map(s => {

      const isThisDevice = s.id === mySessionId;

      return `
        <div class="bf-card" style="padding:14px;display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div>
            <div style="font-weight:700;font-size:14px;">
              ${escapeHtml(s.deviceLabel || "Unknown device")}
              ${isThisDevice ? `<span class="bf-status-pill bf-status-success" style="font-size:10px;margin-left:6px;">This device</span>` : ""}
            </div>
            <div style="font-size:12px;color:var(--ink-soft);margin-top:2px;">
              Last active: ${formatDate(s.lastActiveAt)}
            </div>
            <div style="font-size:11px;color:var(--ink-soft);">
              First login: ${formatDate(s.createdAt)}
            </div>
          </div>
          <button type="button" class="bf-btn bf-btn-ghost bf-btn-sm remove-device-btn" data-id="${escapeHtml(s.id)}" style="color:#c62828;">
            Remove
          </button>
        </div>
      `;

    }).join("");

  } catch (error) {
    console.error("Load devices error:", error);
    deviceList.innerHTML = `<div class="bf-card" style="padding:16px;">❌ Unable to load devices.</div>`;
  }

}

deviceList.addEventListener("click", async (e) => {

  const btn = e.target.closest(".remove-device-btn");
  if (!btn) return;

  const sessionId = btn.dataset.id;
  const isThisDevice = sessionId === mySessionId;

  const ok = window.confirm(
    isThisDevice
      ? "This will log you out of this device. Continue?"
      : "Remove this device from your list? (Note: Firebase can't force-close another device's session remotely — for a full remote sign-out, use 'Logout of All Devices' below.)"
  );
  if (!ok) return;

  try {

    await deleteDoc(doc(db, "users", currentUser.uid, "sessions", sessionId));

    if (isThisDevice) {
      await signOut(auth);
      window.location.href = "login.html";
      return;
    }

    showToast("Device removed", "success");
    loadDevices();

  } catch (error) {
    console.error("Remove device error:", error);
    showToast(error.message || "Failed to remove device.", "danger");
  }

});

logoutAllBtn.addEventListener("click", async () => {

  const ok = window.confirm("Log out of ALL devices, including this one?");
  if (!ok) return;

  logoutAllBtn.disabled = true;
  logoutAllBtn.textContent = "Logging out everywhere...";

  try {

    await revokeAllSessions();
    await signOut(auth);
    window.location.href = "login.html";

  } catch (error) {
    console.error("Logout all devices error:", error);
    alert(error.message || "Failed to log out of all devices.");
    logoutAllBtn.disabled = false;
    logoutAllBtn.textContent = "🚪 Logout of All Devices";
  }

});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  currentUser = user;
  loadDevices();
});
