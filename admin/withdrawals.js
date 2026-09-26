import { auth, db } from "../firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-functions.js";

import {
  openModal,
  closeModal,
  showToast
} from "../design-system.js";

import { logAdminAction } from "./audit.js";

const functions = getFunctions();
const processWithdrawal = httpsCallable(functions, "processWithdrawal");

const wdSummary = document.getElementById("wdSummary");
const wdList = document.getElementById("wdList");
const wdCount = document.getElementById("wdCount");
const wdTypeFilter = document.getElementById("wdTypeFilter");
const wdStatusFilter = document.getElementById("wdStatusFilter");
const wdSearch = document.getElementById("wdSearch");

const wdProcessModal = document.getElementById("wdProcessModal");
const wdProcessCloseBtn = document.getElementById("wdProcessCloseBtn");
const wdProcessTitle = document.getElementById("wdProcessTitle");
const wdProcessSummary = document.getElementById("wdProcessSummary");
const wdProcessForm = document.getElementById("wdProcessForm");
const wdProcessNote = document.getElementById("wdProcessNote");
const wdProcessSubmitBtn = document.getElementById("wdProcessSubmitBtn");

let allRequests = [];
let pendingAction = null; // { id, action }

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function formatDate(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return "";
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

function payoutDetailsHtml(r) {
  if (r.method === "upi") {
    return `UPI: <b>${escapeHtml(r.upiId || "")}</b>`;
  }
  return `Bank: <b>${escapeHtml(r.bankAccountName || "")}</b> · A/C ${escapeHtml(r.bankAccountNumber || "")} · IFSC ${escapeHtml(r.bankIFSC || "")}`;
}

function statusPillClass(status) {
  if (status === "Approved") return "bf-status-success";
  if (status === "Rejected") return "bf-status-danger";
  return "bf-status-pending";
}

async function loadRequests() {

  try {

    const snapshot = await getDocs(collection(db, "withdrawalRequests"));

    allRequests = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

    renderSummary();
    renderList();

  } catch (error) {
    console.error("Withdrawal requests load error:", error);
    wdList.innerHTML = `<div class="bf-card" style="padding:20px;">❌ Unable to load requests.</div>`;
  }

}

function renderSummary() {

  const pending = allRequests.filter(r => r.status === "Pending");
  const pendingTotal = pending.reduce((s, r) => s + Number(r.amount || 0), 0);
  const approvedTotal = allRequests.filter(r => r.status === "Approved").reduce((s, r) => s + Number(r.amount || 0), 0);

  wdSummary.innerHTML = `
    <div class="bf-card" style="padding:14px;min-width:150px;">
      <div style="font-size:12px;opacity:.65;">Pending Requests</div>
      <div style="font-size:20px;font-weight:700;">${pending.length}</div>
    </div>
    <div class="bf-card" style="padding:14px;min-width:150px;">
      <div style="font-size:12px;opacity:.65;">Pending Amount</div>
      <div style="font-size:20px;font-weight:700;color:#D98925;">₹${pendingTotal.toLocaleString("en-IN")}</div>
    </div>
    <div class="bf-card" style="padding:14px;min-width:150px;">
      <div style="font-size:12px;opacity:.65;">Total Paid Out</div>
      <div style="font-size:20px;font-weight:700;color:#2F7A4F;">₹${approvedTotal.toLocaleString("en-IN")}</div>
    </div>
  `;

}

function getFiltered() {

  const type = wdTypeFilter.value;
  const status = wdStatusFilter.value;
  const term = wdSearch.value.trim().toLowerCase();

  return allRequests.filter((r) => {
    const matchesType = type === "All" || r.requesterType === type;
    const matchesStatus = status === "All" || r.status === status;
    const matchesTerm = !term || (r.requesterName || "").toLowerCase().includes(term);
    return matchesType && matchesStatus && matchesTerm;
  });

}

function renderList() {

  const filtered = getFiltered();

  wdCount.textContent = `Showing ${filtered.length} of ${allRequests.length} requests`;

  if (!filtered.length) {
    wdList.innerHTML = `<div class="bf-card" style="padding:20px;">No requests match this filter.</div>`;
    return;
  }

  wdList.innerHTML = filtered.map((r) => `
    <div class="bf-card" style="padding:16px;">

      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
        <div>
          <div style="font-weight:700;">
            ${escapeHtml(r.requesterName || "Unknown")}
            <span class="bf-status-pill" style="margin-left:6px;font-size:10px;">${r.requesterType === "vendor" ? "🏬 Supplier" : "👤 User"}</span>
          </div>
          <div style="font-size:12px;opacity:.65;margin-top:2px;">${formatDate(r.createdAt)}</div>
        </div>
        <span class="bf-status-pill ${statusPillClass(r.status)}">${escapeHtml(r.status || "Pending")}</span>
      </div>

      <div style="margin-top:10px;font-size:20px;font-weight:700;">₹${escapeHtml(String(r.amount ?? 0))}</div>
      <div style="font-size:13px;margin-top:4px;">${payoutDetailsHtml(r)}</div>

      ${r.adminNote ? `<div style="font-size:12px;opacity:.65;margin-top:6px;">📝 ${escapeHtml(r.adminNote)}</div>` : ""}

      ${r.status === "Pending" ? `
        <div style="display:flex; gap:8px; margin-top:12px;">
          <button type="button" class="bf-btn bf-btn-primary bf-btn-sm approve-wd-btn" data-id="${escapeHtml(r.id)}" style="flex:1;">✅ Approve (Paid)</button>
          <button type="button" class="bf-btn bf-btn-ghost bf-btn-sm reject-wd-btn" data-id="${escapeHtml(r.id)}" style="flex:1;color:#c62828;">❌ Reject</button>
        </div>
      ` : ""}

    </div>
  `).join("");

}

wdTypeFilter.addEventListener("change", renderList);
wdStatusFilter.addEventListener("change", renderList);
wdSearch.addEventListener("input", renderList);

wdList.addEventListener("click", (e) => {

  const approveBtn = e.target.closest(".approve-wd-btn");
  if (approveBtn) {
    confirmApprove(approveBtn.dataset.id);
    return;
  }

  const rejectBtn = e.target.closest(".reject-wd-btn");
  if (rejectBtn) {
    openRejectModal(rejectBtn.dataset.id);
  }

});

async function confirmApprove(id) {

  const request = allRequests.find(r => r.id === id);
  if (!request) return;

  const ok = window.confirm(
    `Confirm you have PAID ₹${request.amount} to ${request.requesterName} via ${request.method === "upi" ? "UPI" : "bank transfer"}?\n\nThis only marks the request as paid — it does not send money itself.`
  );
  if (!ok) return;

  try {

    await processWithdrawal({ requestId: id, action: "approve" });

    await logAdminAction("Approved withdrawal", "Withdrawals", { requestId: id, amount: request.amount });

    showToast("Marked as paid", "success");
    await loadRequests();

  } catch (error) {
    console.error("Approve withdrawal error:", error);
    showToast(error.message || "Failed to approve request.", "danger");
  }

}

function openRejectModal(id) {

  const request = allRequests.find(r => r.id === id);
  if (!request) return;

  pendingAction = { id, action: "reject" };

  wdProcessTitle.textContent = "Reject Request";
  wdProcessSummary.textContent = `${request.requesterName} · ₹${request.amount} — amount will be refunded to their wallet.`;
  wdProcessNote.value = "";

  openModal("wdProcessModal");

}

if (wdProcessCloseBtn) {
  wdProcessCloseBtn.addEventListener("click", () => closeModal("wdProcessModal"));
}

if (wdProcessForm) {
  wdProcessForm.addEventListener("submit", async (e) => {

    e.preventDefault();
    if (!pendingAction) return;

    wdProcessSubmitBtn.disabled = true;
    wdProcessSubmitBtn.textContent = "Saving...";

    try {

      await processWithdrawal({
        requestId: pendingAction.id,
        action: pendingAction.action,
        adminNote: wdProcessNote.value.trim()
      });

      await logAdminAction("Rejected withdrawal", "Withdrawals", { requestId: pendingAction.id });

      showToast("Request rejected and refunded", "success");
      closeModal("wdProcessModal");
      pendingAction = null;

      await loadRequests();

    } catch (error) {
      console.error("Reject withdrawal error:", error);
      showToast(error.message || "Failed to reject request.", "danger");
    } finally {
      wdProcessSubmitBtn.disabled = false;
      wdProcessSubmitBtn.textContent = "Confirm";
    }

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

  loadRequests();

});
