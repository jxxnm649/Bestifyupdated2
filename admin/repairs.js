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
  updateDoc,
  deleteDoc,
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


const repairsSummary = document.getElementById("repairsSummary");
const addRepairBtn = document.getElementById("addRepairBtn");
const repairSearch = document.getElementById("repairSearch");
const repairStatusFilter = document.getElementById("repairStatusFilter");
const repairCount = document.getElementById("repairCount");
const repairsList = document.getElementById("repairsList");

const repairFormModal = document.getElementById("repairFormModal");
const repairFormCloseBtn = document.getElementById("repairFormCloseBtn");
const repairForm = document.getElementById("repairForm");
const repairFormSubmitBtn = document.getElementById("repairFormSubmitBtn");
const repairCustomerName = document.getElementById("repairCustomerName");
const repairMobile = document.getElementById("repairMobile");
const repairDevice = document.getElementById("repairDevice");
const repairIssue = document.getElementById("repairIssue");
const repairEstimatedCost = document.getElementById("repairEstimatedCost");

const repairDetailsModal = document.getElementById("repairDetailsModal");
const repairDetailsCloseBtn = document.getElementById("repairDetailsCloseBtn");
const repairDetailsContent = document.getElementById("repairDetailsContent");

const STATUS_OPTIONS = [
  "Received", "Diagnosing", "In Repair",
  "Ready for Pickup", "Completed", "Cancelled"
];

let allRepairs = [];
let currentDetailsRepairId = null;


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
    if (isNaN(d.getTime())) return "Not available";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
      " · " +
      d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "Not available";
  }
}

function statusPillClass(status) {
  if (status === "Cancelled") return "bf-status-danger";
  if (status === "Completed") return "bf-status-success";
  if (status === "Received") return "bf-status-pending";
  return "bf-status-progress";
}


/* =========================
   SUMMARY
========================= */

function renderSummary() {

  const total = allRepairs.length;
  const active = allRepairs.filter(r =>
    !["Completed", "Cancelled"].includes(r.status)
  ).length;
  const readyForPickup = allRepairs.filter(r => r.status === "Ready for Pickup").length;
  const completed = allRepairs.filter(r => r.status === "Completed").length;

  repairsSummary.innerHTML = `

    <div class="bf-card" style="padding:12px 16px;">
      <div style="font-size:12px; opacity:.65;">Total Requests</div>
      <div style="font-size:18px; font-weight:700;">${total}</div>
    </div>

    <div class="bf-card" style="padding:12px 16px;">
      <div style="font-size:12px; opacity:.65;">In Progress</div>
      <div style="font-size:18px; font-weight:700;">${active}</div>
    </div>

    <div class="bf-card" style="padding:12px 16px;">
      <div style="font-size:12px; opacity:.65;">Ready for Pickup</div>
      <div style="font-size:18px; font-weight:700;">${readyForPickup}</div>
    </div>

    <div class="bf-card" style="padding:12px 16px;">
      <div style="font-size:12px; opacity:.65;">Completed</div>
      <div style="font-size:18px; font-weight:700;">${completed}</div>
    </div>

  `;

}


/* =========================
   LOAD DATA
========================= */

async function loadRepairs() {

  try {

    let snapshot;

    try {
      snapshot = await getDocs(
        query(collection(db, "repairs"), orderBy("createdAt", "desc"))
      );
    } catch {
      snapshot = await getDocs(collection(db, "repairs"));
    }

    allRepairs = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    renderSummary();
    renderRepairsList();

  } catch (error) {

    console.error("Repairs loading error:", error);

    repairsList.innerHTML = `
      <div class="bf-card" style="padding:20px;">
        ❌ Unable to load repair requests.
      </div>
    `;

  }

}


/* =========================
   ADD REPAIR MODAL
========================= */

if (addRepairBtn) {
  addRepairBtn.addEventListener("click", () => {
    repairForm.reset();
    openModal("repairFormModal");
  });
}

if (repairFormCloseBtn) {
  repairFormCloseBtn.addEventListener("click", () => {
    closeModal("repairFormModal");
  });
}

repairForm.addEventListener("submit", async (e) => {

  e.preventDefault();

  repairFormSubmitBtn.disabled = true;
  repairFormSubmitBtn.textContent = "Saving...";

  try {

    await addDoc(collection(db, "repairs"), {
      customerName: repairCustomerName.value.trim(),
      mobile: repairMobile.value.trim(),
      device: repairDevice.value.trim(),
      issue: repairIssue.value.trim(),
      estimatedCost: Number(repairEstimatedCost.value) || 0,
      status: "Received",
      createdAt: serverTimestamp()
    });

    await logAdminAction("Logged repair request", "Repairs", {
      customerName: repairCustomerName.value.trim(),
      device: repairDevice.value.trim()
    });

    showToast("Repair request added", "success");
    closeModal("repairFormModal");
    repairForm.reset();
    loadRepairs();

  } catch (error) {

    console.error("Repair save error:", error);
    showToast(error.message || "Failed to save repair request.", "danger");

  } finally {

    repairFormSubmitBtn.disabled = false;
    repairFormSubmitBtn.textContent = "Save Repair Request";

  }

});


/* =========================
   REPAIRS LIST
========================= */

function getFilteredRepairs() {

  const term = repairSearch.value.trim().toLowerCase();
  const statusFilter = repairStatusFilter.value;

  return allRepairs.filter((r) => {

    const name = (r.customerName || "").toLowerCase();
    const mobile = (r.mobile || "").toLowerCase();
    const device = (r.device || "").toLowerCase();

    const matchesTerm = !term || name.includes(term) || mobile.includes(term) || device.includes(term);
    const matchesStatus = statusFilter === "All Status" || r.status === statusFilter;

    return matchesTerm && matchesStatus;

  });

}

function renderRepairsList() {

  const filtered = getFilteredRepairs();

  repairCount.textContent = `Total Requests: ${allRepairs.length}`;

  if (!filtered.length) {
    repairsList.innerHTML = `
      <div class="bf-card" style="padding:20px;">
        No repair requests found.
      </div>
    `;
    return;
  }

  repairsList.innerHTML = filtered.map((r) => {

    return `
      <div class="bf-card" style="padding:16px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">

        <div>
          <div style="font-weight:700;">
            ${escapeHtml(r.customerName || "Customer")} · ${escapeHtml(r.device || "Device")}
          </div>

          <div style="font-size:13px; opacity:.7; margin-top:2px;">
            ${escapeHtml(r.mobile || "No mobile")}${r.estimatedCost ? " · Est. ₹" + escapeHtml(String(r.estimatedCost)) : ""}
          </div>

          <div style="font-size:12px; opacity:.55; margin-top:2px;">
            ${formatDate(r.createdAt)}
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:10px;">
          <span class="bf-status-pill ${statusPillClass(r.status)}">
            ${escapeHtml(r.status || "Received")}
          </span>

          <button
            type="button"
            class="bf-btn bf-btn-ghost bf-btn-sm view-repair-btn"
            data-id="${escapeHtml(r.id)}">
            View
          </button>
        </div>

      </div>
    `;

  }).join("");

}

if (repairSearch) repairSearch.addEventListener("input", renderRepairsList);
if (repairStatusFilter) repairStatusFilter.addEventListener("change", renderRepairsList);


/* =========================
   REPAIR DETAILS MODAL
========================= */

function renderRepairDetails(r) {

  repairDetailsContent.innerHTML = `

    <div style="margin-bottom:14px;">
      <div><b>Customer:</b> ${escapeHtml(r.customerName || "Not available")}</div>
      <div><b>Mobile:</b> ${escapeHtml(r.mobile || "Not available")}</div>
      <div><b>Device:</b> ${escapeHtml(r.device || "Not available")}</div>
      <div><b>Issue:</b> ${escapeHtml(r.issue || "Not available")}</div>
      <div><b>Estimated Cost:</b> ₹${escapeHtml(String(r.estimatedCost ?? 0))}</div>
      <div><b>Logged on:</b> ${formatDate(r.createdAt)}</div>
    </div>

    <h3 style="font-size:14px; margin:16px 0 8px;">🔧 Update Status</h3>

    <div class="bf-field">
      <select id="repairStatusSelect" class="bf-select">
        ${STATUS_OPTIONS.map(s =>
          `<option value="${s}" ${r.status === s ? "selected" : ""}>${s}</option>`
        ).join("")}
      </select>
    </div>

    <button
      type="button"
      id="updateRepairStatusBtn"
      class="bf-btn bf-btn-primary bf-btn-block"
      style="margin-bottom:10px;">
      Update Status
    </button>

    <button
      type="button"
      id="deleteRepairBtn"
      class="bf-btn bf-btn-ghost bf-btn-block"
      style="color:#c62828;">
      🗑️ Delete Request
    </button>

  `;

}

if (repairsList) {
  repairsList.addEventListener("click", (e) => {

    const viewBtn = e.target.closest(".view-repair-btn");
    if (!viewBtn) return;

    const id = viewBtn.dataset.id;
    const r = allRepairs.find(x => x.id === id);
    if (!r) return;

    currentDetailsRepairId = id;
    renderRepairDetails(r);
    openModal("repairDetailsModal");

  });
}

if (repairDetailsCloseBtn) {
  repairDetailsCloseBtn.addEventListener("click", () => {
    closeModal("repairDetailsModal");
  });
}

if (repairDetailsContent) {
  repairDetailsContent.addEventListener("click", async (e) => {

    if (e.target.id === "updateRepairStatusBtn") {

      const btn = e.target;
      const select = document.getElementById("repairStatusSelect");
      const newStatus = select.value;

      btn.disabled = true;
      btn.textContent = "Updating...";

      try {

        await updateDoc(doc(db, "repairs", currentDetailsRepairId), { status: newStatus });

        await logAdminAction("Updated repair status", "Repairs", {
          repairId: currentDetailsRepairId,
          newStatus
        });

        const idx = allRepairs.findIndex(r => r.id === currentDetailsRepairId);
        if (idx !== -1) {
          allRepairs[idx] = { ...allRepairs[idx], status: newStatus };
        }

        renderSummary();
        renderRepairsList();
        showToast("Repair status updated", "success");
        closeModal("repairDetailsModal");

      } catch (error) {

        console.error("Repair status update error:", error);
        showToast(error.message || "Failed to update status.", "danger");

      } finally {

        btn.disabled = false;
        btn.textContent = "Update Status";

      }

      return;

    }

    if (e.target.id === "deleteRepairBtn") {

      const ok = window.confirm("Delete this repair request? This cannot be undone.");
      if (!ok) return;

      try {

        await deleteDoc(doc(db, "repairs", currentDetailsRepairId));

        await logAdminAction("Deleted repair request", "Repairs", {
          repairId: currentDetailsRepairId
        });

        allRepairs = allRepairs.filter(r => r.id !== currentDetailsRepairId);

        renderSummary();
        renderRepairsList();
        showToast("Repair request deleted", "success");
        closeModal("repairDetailsModal");

      } catch (error) {

        console.error("Delete repair error:", error);
        showToast(error.message || "Failed to delete repair request.", "danger");

      }

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

  loadRepairs();

});
