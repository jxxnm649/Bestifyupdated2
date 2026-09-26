import { auth, db } from "../firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import {
  openModal,
  closeModal,
  showToast
} from "../design-system.js";

import { logAdminAction } from "./audit.js";


const notificationsSummary = document.getElementById("notificationsSummary");
const composeBtn = document.getElementById("composeBtn");
const notifSearch = document.getElementById("notifSearch");
const notifTargetFilter = document.getElementById("notifTargetFilter");
const notifCount = document.getElementById("notifCount");
const notifList = document.getElementById("notifList");

const notifFormModal = document.getElementById("notifFormModal");
const notifFormCloseBtn = document.getElementById("notifFormCloseBtn");
const notifForm = document.getElementById("notifForm");
const notifFormSubmitBtn = document.getElementById("notifFormSubmitBtn");
const notifTarget = document.getElementById("notifTarget");
const notifUserField = document.getElementById("notifUserField");
const notifUserSelect = document.getElementById("notifUserSelect");
const notifTitle = document.getElementById("notifTitle");
const notifMessage = document.getElementById("notifMessage");

let allUsers = [];
let allNotifications = [];


/* =========================
   HELPERS
========================= */

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
    return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "Just now";
  }
}

function isToday(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  } catch {
    return false;
  }
}


/* =========================
   LOAD DATA
========================= */

async function loadUsers() {
  const snapshot = await getDocs(collection(db, "users"));

  allUsers = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));

  notifUserSelect.innerHTML =
    `<option value="">Select a user...</option>` +
    allUsers.map((u) => {
      const name = u.name || u.fullName || u.displayName || u.email || "Unnamed user";
      return `<option value="${escapeHtml(u.id)}">${escapeHtml(name)}</option>`;
    }).join("");
}

async function loadNotifications() {
  notifList.innerHTML = `<div class="bf-card" style="padding:20px;">Loading notifications...</div>`;

  try {
    const q = query(collection(db, "notifications"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    allNotifications = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    renderSummary();
    renderList();

  } catch (error) {
    console.error("Load notifications error:", error);
    notifList.innerHTML = `<div class="bf-card" style="padding:20px;">Unable to load notifications.</div>`;
    notifCount.textContent = "—";
  }
}


/* =========================
   RENDER
========================= */

function renderSummary() {
  const total = allNotifications.length;
  const today = allNotifications.filter(n => isToday(n.createdAt)).length;
  const broadcasts = allNotifications.filter(n => n.target === "all").length;
  const targeted = allNotifications.filter(n => n.target === "user").length;

  notificationsSummary.innerHTML = `
    <div class="bf-card" style="padding:16px 20px; min-width:130px;">
      <div style="font-size:12px; opacity:.7;">Total Sent</div>
      <div style="font-size:22px; font-weight:700;">${total}</div>
    </div>
    <div class="bf-card" style="padding:16px 20px; min-width:130px;">
      <div style="font-size:12px; opacity:.7;">Sent Today</div>
      <div style="font-size:22px; font-weight:700;">${today}</div>
    </div>
    <div class="bf-card" style="padding:16px 20px; min-width:130px;">
      <div style="font-size:12px; opacity:.7;">Broadcasts</div>
      <div style="font-size:22px; font-weight:700;">${broadcasts}</div>
    </div>
    <div class="bf-card" style="padding:16px 20px; min-width:130px;">
      <div style="font-size:12px; opacity:.7;">Targeted</div>
      <div style="font-size:22px; font-weight:700;">${targeted}</div>
    </div>
  `;
}

function renderList() {
  const searchTerm = (notifSearch.value || "").trim().toLowerCase();
  const targetFilter = notifTargetFilter.value;

  let filtered = allNotifications.filter(n => {
    const matchesSearch =
      !searchTerm ||
      (n.title || "").toLowerCase().includes(searchTerm) ||
      (n.message || "").toLowerCase().includes(searchTerm);

    const matchesTarget = targetFilter === "All" || n.target === targetFilter;

    return matchesSearch && matchesTarget;
  });

  notifCount.textContent = `${filtered.length} notification${filtered.length === 1 ? "" : "s"}`;

  if (filtered.length === 0) {
    notifList.innerHTML = `<div class="bf-card" style="padding:20px;">No notifications found.</div>`;
    return;
  }

  notifList.innerHTML = filtered.map(n => {
    const badge = n.target === "all"
      ? `<span class="bf-badge bf-badge-info">Broadcast</span>`
      : `<span class="bf-badge bf-badge-neutral">To: ${escapeHtml(n.targetUserName || "User")}</span>`;

    return `
      <div class="bf-card" style="padding:18px;">
        <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:flex-start;">
          <div>
            <div style="font-weight:700; margin-bottom:4px;">${escapeHtml(n.title || "Untitled")}</div>
            <div style="font-size:13px; opacity:.85; margin-bottom:8px;">${escapeHtml(n.message || "")}</div>
            <div style="font-size:12px; opacity:.6;">${formatDate(n.createdAt)} · Sent by ${escapeHtml(n.sentBy || "Admin")}</div>
          </div>
          ${badge}
        </div>
      </div>
    `;
  }).join("");
}


/* =========================
   COMPOSE MODAL
========================= */

composeBtn.addEventListener("click", () => {
  notifForm.reset();
  notifUserField.style.display = "none";
  openModal("notifFormModal");
});

notifFormCloseBtn.addEventListener("click", () => closeModal("notifFormModal"));

notifTarget.addEventListener("change", () => {
  notifUserField.style.display = notifTarget.value === "user" ? "block" : "none";
});

notifSearch.addEventListener("input", renderList);
notifTargetFilter.addEventListener("change", renderList);


/* =========================
   SEND NOTIFICATION
========================= */

notifForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const target = notifTarget.value;
  const title = notifTitle.value.trim();
  const message = notifMessage.value.trim();

  if (!title || !message) {
    showToast("Please fill in title and message", "danger");
    return;
  }

  let targetUserId = null;
  let targetUserName = null;

  if (target === "user") {
    targetUserId = notifUserSelect.value;
    if (!targetUserId) {
      showToast("Please select a user", "danger");
      return;
    }
    const selectedUser = allUsers.find(u => u.id === targetUserId);
    targetUserName = selectedUser
      ? (selectedUser.name || selectedUser.fullName || selectedUser.displayName || selectedUser.email || "User")
      : "User";
  }

  notifFormSubmitBtn.disabled = true;
  notifFormSubmitBtn.textContent = "Sending...";

  try {
    const currentUser = auth.currentUser;
    const sentBy = currentUser ? (currentUser.email || "Admin") : "Admin";

    await addDoc(collection(db, "notifications"), {
      title,
      message,
      target,
      targetUserId,
      targetUserName,
      sentBy,
      readBy: [],
      createdAt: serverTimestamp()
    });

    await logAdminAction(
      "Sent notification",
      "Notifications",
      { title, target, targetUserId: targetUserId || "all" }
    );

    showToast("Notification sent", "success");
    closeModal("notifFormModal");
    await loadNotifications();

  } catch (error) {
    console.error("Send notification error:", error);
    showToast(error.message || "Failed to send notification", "danger");

  } finally {
    notifFormSubmitBtn.disabled = false;
    notifFormSubmitBtn.textContent = "Send Notification";
  }
});


/* =========================
   APP INIT (ADMIN CHECK)
========================= */

onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "../login.html";
    return;
  }

  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));

    if (!userDoc.exists() || userDoc.data().isAdmin !== true) {
      alert("Access Denied ❌");
      window.location.href = "../home.html";
      return;
    }

  } catch (error) {
    console.error("Admin check error:", error);
    window.location.href = "../home.html";
    return;
  }

  await loadUsers();
  await loadNotifications();

});
