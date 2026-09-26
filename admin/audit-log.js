import { auth, db } from "../firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  orderBy,
  limit as fbLimit
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { openModal, closeModal, showToast } from "../design-system.js";


const auditSummary = document.getElementById("auditSummary");
const auditSearch = document.getElementById("auditSearch");
const auditModuleFilter = document.getElementById("auditModuleFilter");
const auditRangeFilter = document.getElementById("auditRangeFilter");
const auditCount = document.getElementById("auditCount");
const auditList = document.getElementById("auditList");

const auditDetailsModal = document.getElementById("auditDetailsModal");
const auditDetailsCloseBtn = document.getElementById("auditDetailsCloseBtn");
const auditDetailsContent = document.getElementById("auditDetailsContent");

const MAX_ENTRIES = 500;

let allLogs = [];


/* =========================
   HELPERS
========================= */

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function toDate(value) {
  try {
    const d = value?.toDate ? value.toDate() : new Date(value);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function formatDateTime(value) {
  const d = toDate(value);
  if (!d) return "Not available";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}


/* =========================
   SUMMARY
========================= */

function renderSummary() {

  const total = allLogs.length;

  const now = new Date();
  const todayCount = allLogs.filter(l => {
    const d = toDate(l.createdAt);
    return d && isSameDay(d, now);
  }).length;

  const modules = new Set(allLogs.map(l => l.module || "General"));
  const admins = new Set(allLogs.map(l => l.performedBy || "Unknown"));

  auditSummary.innerHTML = `

    <div class="bf-card" style="padding:12px 16px;">
      <div style="font-size:12px; opacity:.65;">Total Entries</div>
      <div style="font-size:18px; font-weight:700;">${total}</div>
    </div>

    <div class="bf-card" style="padding:12px 16px;">
      <div style="font-size:12px; opacity:.65;">Today</div>
      <div style="font-size:18px; font-weight:700;">${todayCount}</div>
    </div>

    <div class="bf-card" style="padding:12px 16px;">
      <div style="font-size:12px; opacity:.65;">Modules Touched</div>
      <div style="font-size:18px; font-weight:700;">${modules.size}</div>
    </div>

    <div class="bf-card" style="padding:12px 16px;">
      <div style="font-size:12px; opacity:.65;">Admins Active</div>
      <div style="font-size:18px; font-weight:700;">${admins.size}</div>
    </div>

  `;

}


/* =========================
   MODULE FILTER OPTIONS
========================= */

function populateModuleFilter() {

  const modules = Array.from(
    new Set(allLogs.map(l => l.module || "General"))
  ).sort();

  const current = auditModuleFilter.value || "All";

  auditModuleFilter.innerHTML =
    `<option value="All">All Modules</option>` +
    modules.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");

  auditModuleFilter.value = modules.includes(current) ? current : "All";

}


/* =========================
   FILTER + RENDER LIST
========================= */

function getFilteredLogs() {

  const term = (auditSearch.value || "").trim().toLowerCase();
  const moduleFilter = auditModuleFilter.value || "All";
  const rangeFilter = auditRangeFilter.value || "all";

  const now = new Date();

  return allLogs.filter(log => {

    if (moduleFilter !== "All" && (log.module || "General") !== moduleFilter) {
      return false;
    }

    if (rangeFilter !== "all") {

      const d = toDate(log.createdAt);
      if (!d) return false;

      if (rangeFilter === "today") {
        if (!isSameDay(d, now)) return false;
      } else {
        const days = Number(rangeFilter);
        const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        if (d < cutoff) return false;
      }

    }

    if (term) {
      const haystack = [
        log.action, log.module, log.performedBy
      ].filter(Boolean).join(" ").toLowerCase();

      if (!haystack.includes(term)) return false;
    }

    return true;

  });

}


function renderList() {

  const filtered = getFilteredLogs();

  auditCount.textContent =
    `${filtered.length} log ${filtered.length === 1 ? "entry" : "entries"}`;

  if (filtered.length === 0) {
    auditList.innerHTML = `
      <div class="bf-card" style="padding:24px; text-align:center;">
        <div style="font-size:28px; margin-bottom:8px;">🗂️</div>
        <div style="font-weight:600;">No log entries found</div>
        <div style="opacity:.65; font-size:13px; margin-top:4px;">
          Try adjusting your search or filters.
        </div>
      </div>
    `;
    return;
  }

  auditList.innerHTML = filtered.map(log => `

    <div class="bf-card audit-row" data-id="${log.id}" style="padding:14px 16px; cursor:pointer; display:flex; justify-content:space-between; gap:12px; align-items:center; flex-wrap:wrap;">

      <div style="min-width:0;">
        <div style="font-weight:600;">
          ${escapeHtml(log.action || "Action")}
        </div>
        <div style="font-size:13px; opacity:.7; margin-top:2px;">
          ${escapeHtml(log.module || "General")} · by ${escapeHtml(log.performedBy || "Unknown")}
        </div>
      </div>

      <div style="font-size:12px; opacity:.6; white-space:nowrap;">
        ${formatDateTime(log.createdAt)}
      </div>

    </div>

  `).join("");

}


/* =========================
   DETAILS MODAL
========================= */

auditList.addEventListener("click", (e) => {

  const row = e.target.closest(".audit-row");
  if (!row) return;

  const log = allLogs.find(l => l.id === row.dataset.id);
  if (!log) return;

  let detailsHtml = "None";

  try {
    if (log.details && Object.keys(log.details).length > 0) {
      detailsHtml = `<pre style="white-space:pre-wrap; word-break:break-word; font-size:13px; background:var(--paper-dim,#F2ECE0); padding:10px; border-radius:8px;">${escapeHtml(JSON.stringify(log.details, null, 2))}</pre>`;
    }
  } catch {
    detailsHtml = "Unable to display details.";
  }

  auditDetailsContent.innerHTML = `

    <div class="bf-field">
      <label class="bf-label">Action</label>
      <div>${escapeHtml(log.action || "Action")}</div>
    </div>

    <div class="bf-field">
      <label class="bf-label">Module</label>
      <div>${escapeHtml(log.module || "General")}</div>
    </div>

    <div class="bf-field">
      <label class="bf-label">Performed By</label>
      <div>${escapeHtml(log.performedBy || "Unknown")}</div>
    </div>

    <div class="bf-field">
      <label class="bf-label">Timestamp</label>
      <div>${formatDateTime(log.createdAt)}</div>
    </div>

    <div class="bf-field">
      <label class="bf-label">Details</label>
      ${detailsHtml}
    </div>

  `;

  openModal("auditDetailsModal");

});

auditDetailsCloseBtn.addEventListener("click", () => closeModal("auditDetailsModal"));


/* =========================
   FILTER EVENTS
========================= */

auditSearch.addEventListener("input", renderList);
auditModuleFilter.addEventListener("change", renderList);
auditRangeFilter.addEventListener("change", renderList);


/* =========================
   LOAD LOGS
========================= */

async function loadLogs() {

  try {

    const q = query(
      collection(db, "auditLogs"),
      orderBy("createdAt", "desc"),
      fbLimit(MAX_ENTRIES)
    );

    const snapshot = await getDocs(q);

    allLogs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    renderSummary();
    populateModuleFilter();
    renderList();

  } catch (error) {

    console.error("Audit log load error:", error);

    auditCount.textContent = "";
    auditList.innerHTML = `
      <div class="bf-card" style="padding:24px; text-align:center;">
        <div style="font-size:28px; margin-bottom:8px;">⚠️</div>
        <div style="font-weight:600;">Unable to load audit log</div>
        <div style="opacity:.65; font-size:13px; margin-top:4px;">
          Please try again.
        </div>
      </div>
    `;

    showToast(error.message || "Failed to load audit log.", "danger");

  }

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

  loadLogs();

});
