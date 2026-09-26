import { auth, db } from "../firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const alertsSummary = document.getElementById("alertsSummary");
const alertsList = document.getElementById("alertsList");
const alertsCount = document.getElementById("alertsCount");
const alertsTypeFilter = document.getElementById("alertsTypeFilter");
const markAllReadBtn = document.getElementById("markAllReadBtn");

let allAlerts = [];

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function formatDate(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return "just now";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) +
      " · " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function iconFor(type) {
  if (type === "signup") return "🆕";
  if (type === "like") return "❤️";
  if (type === "order") return "🛒";
  if (type === "order_cancel") return "❌";
  return "🔔";
}

function renderSummary() {

  const unread = allAlerts.filter(a => !a.read).length;
  const signups = allAlerts.filter(a => a.type === "signup").length;
  const orders = allAlerts.filter(a => a.type === "order").length;
  const cancellations = allAlerts.filter(a => a.type === "order_cancel").length;

  alertsSummary.innerHTML = `
    <div class="bf-card" style="padding:14px;min-width:130px;">
      <div style="font-size:12px;opacity:.65;">Unread</div>
      <div style="font-size:20px;font-weight:700;color:#D98925;">${unread}</div>
    </div>
    <div class="bf-card" style="padding:14px;min-width:130px;">
      <div style="font-size:12px;opacity:.65;">New Signups</div>
      <div style="font-size:20px;font-weight:700;">${signups}</div>
    </div>
    <div class="bf-card" style="padding:14px;min-width:130px;">
      <div style="font-size:12px;opacity:.65;">Orders</div>
      <div style="font-size:20px;font-weight:700;color:#2F7A4F;">${orders}</div>
    </div>
    <div class="bf-card" style="padding:14px;min-width:130px;">
      <div style="font-size:12px;opacity:.65;">Cancellations</div>
      <div style="font-size:20px;font-weight:700;color:#c62828;">${cancellations}</div>
    </div>
  `;

}

function renderList() {

  const type = alertsTypeFilter.value;
  const filtered = type === "All" ? allAlerts : allAlerts.filter(a => a.type === type);

  alertsCount.textContent = `Showing ${filtered.length} of ${allAlerts.length} events (most recent 200)`;

  if (!filtered.length) {
    alertsList.innerHTML = `<div class="bf-card" style="padding:20px;">No activity yet.</div>`;
    return;
  }

  alertsList.innerHTML = filtered.map(a => `
    <div class="bf-card alert-row-btn" data-id="${escapeHtml(a.id)}" style="padding:14px;display:flex;gap:12px;align-items:flex-start;cursor:pointer;${a.read ? "opacity:.6;" : "border-left:3px solid #D98925;"}">
      <div style="font-size:20px;">${iconFor(a.type)}</div>
      <div style="flex:1;">
        <div style="font-size:13px;">${escapeHtml(a.message || "")}</div>
        <div style="font-size:11px;opacity:.6;margin-top:3px;">${formatDate(a.createdAt)}</div>
      </div>
      ${!a.read ? `<span class="bf-status-pill bf-status-pending" style="font-size:10px;">New</span>` : ""}
    </div>
  `).join("");

}

alertsTypeFilter.addEventListener("change", renderList);

alertsList.addEventListener("click", async (e) => {

  const row = e.target.closest(".alert-row-btn");
  if (!row) return;

  const id = row.dataset.id;
  const alert = allAlerts.find(a => a.id === id);
  if (!alert || alert.read) return;

  try {
    await updateDoc(doc(db, "adminAlerts", id), { read: true });
  } catch (error) {
    console.error("Mark read error:", error);
  }

});

markAllReadBtn.addEventListener("click", async () => {

  const unread = allAlerts.filter(a => !a.read);
  if (!unread.length) return;

  markAllReadBtn.disabled = true;
  markAllReadBtn.textContent = "Marking...";

  try {

    const batch = writeBatch(db);
    unread.forEach(a => batch.update(doc(db, "adminAlerts", a.id), { read: true }));
    await batch.commit();

  } catch (error) {
    console.error("Mark all read error:", error);
  } finally {
    markAllReadBtn.disabled = false;
    markAllReadBtn.textContent = "✓ Mark All Read";
  }

});

function listenForAlerts() {

  const q = query(collection(db, "adminAlerts"), orderBy("createdAt", "desc"), limit(200));

  onSnapshot(q, (snapshot) => {
    allAlerts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderSummary();
    renderList();
  }, (error) => {
    console.error("Alerts listen error:", error);
    alertsList.innerHTML = `<div class="bf-card" style="padding:20px;">❌ Unable to load activity.</div>`;
  });

}


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

  listenForAlerts();

});
