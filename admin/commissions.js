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


const commissionsSummary = document.getElementById("commissionsSummary");
const addCommissionBtn = document.getElementById("addCommissionBtn");
const commissionSearch = document.getElementById("commissionSearch");
const commissionStatusFilter = document.getElementById("commissionStatusFilter");
const commissionCount = document.getElementById("commissionCount");
const commissionsList = document.getElementById("commissionsList");

const commissionFormModal = document.getElementById("commissionFormModal");
const commissionFormCloseBtn = document.getElementById("commissionFormCloseBtn");
const commissionForm = document.getElementById("commissionForm");
const commissionFormSubmitBtn = document.getElementById("commissionFormSubmitBtn");
const commissionVendorSelect = document.getElementById("commissionVendorSelect");
const commissionOrderAmount = document.getElementById("commissionOrderAmount");
const commissionRateInput = document.getElementById("commissionRateInput");
const commissionAmount = document.getElementById("commissionAmount");
const commissionNote = document.getElementById("commissionNote");

let allVendors = [];
let allCommissions = [];


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
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "Not available";
  }
}

function statusPillClass(status) {
  return status === "Collected" ? "bf-status-success" : "bf-status-pending";
}

function computeCommission() {
  const orderAmount = Number(commissionOrderAmount.value) || 0;
  const rate = Number(commissionRateInput.value) || 0;
  const amount = (orderAmount * rate) / 100;
  commissionAmount.value = amount.toFixed(2);
}


/* =========================
   LOAD DATA
========================= */

async function loadVendors() {

  const snapshot = await getDocs(collection(db, "vendors"));

  allVendors = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));

  commissionVendorSelect.innerHTML =
    `<option value="">Select a vendor...</option>` +
    allVendors.map((v) => {
      const name = v.shopName || v.ownerName || "Unnamed vendor";
      return `<option value="${escapeHtml(v.id)}" data-rate="${escapeHtml(String(v.commissionRate ?? 0))}">${escapeHtml(name)}</option>`;
    }).join("");

}

async function loadCommissions() {

  try {

    let snapshot;

    try {
      snapshot = await getDocs(
        query(collection(db, "commissions"), orderBy("createdAt", "desc"))
      );
    } catch {
      snapshot = await getDocs(collection(db, "commissions"));
    }

    allCommissions = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    renderSummary();
    renderCommissionsList();

  } catch (error) {

    console.error("Commissions loading error:", error);

    commissionsList.innerHTML = `
      <div class="bf-card" style="padding:20px;">
        ❌ Unable to load commissions.
      </div>
    `;

  }

}


/* =========================
   SUMMARY
========================= */

function renderSummary() {

  const total = allCommissions.length;
  const pending = allCommissions.filter(c => c.status !== "Collected").length;
  const collected = allCommissions.filter(c => c.status === "Collected").length;

  const totalEarned = allCommissions
    .reduce((sum, c) => sum + Number(c.commissionAmount || 0), 0);

  const totalCollected = allCommissions
    .filter(c => c.status === "Collected")
    .reduce((sum, c) => sum + Number(c.commissionAmount || 0), 0);

  commissionsSummary.innerHTML = `

    <div class="bf-card" style="padding:12px 16px;">
      <div style="font-size:12px; opacity:.65;">Total Entries</div>
      <div style="font-size:18px; font-weight:700;">${total}</div>
    </div>

    <div class="bf-card" style="padding:12px 16px;">
      <div style="font-size:12px; opacity:.65;">Pending</div>
      <div style="font-size:18px; font-weight:700;">${pending}</div>
    </div>

    <div class="bf-card" style="padding:12px 16px;">
      <div style="font-size:12px; opacity:.65;">Collected</div>
      <div style="font-size:18px; font-weight:700;">${collected}</div>
    </div>

    <div class="bf-card" style="padding:12px 16px;">
      <div style="font-size:12px; opacity:.65;">Total Commission Earned</div>
      <div style="font-size:18px; font-weight:700;">₹${totalEarned.toLocaleString("en-IN")}</div>
    </div>

    <div class="bf-card" style="padding:12px 16px;">
      <div style="font-size:12px; opacity:.65;">Total Collected</div>
      <div style="font-size:18px; font-weight:700;">₹${totalCollected.toLocaleString("en-IN")}</div>
    </div>

  `;

}


/* =========================
   ADD COMMISSION MODAL
========================= */

if (addCommissionBtn) {
  addCommissionBtn.addEventListener("click", () => {
    commissionForm.reset();
    commissionRateInput.value = 10;
    commissionAmount.value = "0.00";
    openModal("commissionFormModal");
  });
}

if (commissionFormCloseBtn) {
  commissionFormCloseBtn.addEventListener("click", () => {
    closeModal("commissionFormModal");
  });
}

if (commissionVendorSelect) {
  commissionVendorSelect.addEventListener("change", () => {
    const selected = commissionVendorSelect.selectedOptions[0];
    const rate = selected ? Number(selected.dataset.rate) || 0 : 10;
    commissionRateInput.value = rate;
    computeCommission();
  });
}

if (commissionOrderAmount) {
  commissionOrderAmount.addEventListener("input", computeCommission);
}

if (commissionRateInput) {
  commissionRateInput.addEventListener("input", computeCommission);
}

commissionForm.addEventListener("submit", async (e) => {

  e.preventDefault();

  const vendorId = commissionVendorSelect.value;
  const vendor = allVendors.find(v => v.id === vendorId);

  if (!vendor) {
    showToast("Select a valid vendor", "danger");
    return;
  }

  commissionFormSubmitBtn.disabled = true;
  commissionFormSubmitBtn.textContent = "Saving...";

  try {

    computeCommission();

    await addDoc(collection(db, "commissions"), {
      vendorId,
      vendorName: vendor.shopName || vendor.ownerName || "Vendor",
      orderAmount: Number(commissionOrderAmount.value) || 0,
      commissionRate: Number(commissionRateInput.value) || 0,
      commissionAmount: Number(commissionAmount.value) || 0,
      note: commissionNote.value.trim(),
      status: "Pending",
      createdAt: serverTimestamp()
    });

    await logAdminAction("Added commission", "Commissions", {
      vendorId,
      commissionAmount: Number(commissionAmount.value) || 0
    });

    showToast("Commission entry added", "success");
    closeModal("commissionFormModal");
    commissionForm.reset();
    loadCommissions();

  } catch (error) {

    console.error("Commission save error:", error);
    showToast(error.message || "Failed to save commission entry.", "danger");

  } finally {

    commissionFormSubmitBtn.disabled = false;
    commissionFormSubmitBtn.textContent = "Save Commission";

  }

});


/* =========================
   COMMISSIONS LIST
========================= */

function getFilteredCommissions() {

  const term = commissionSearch.value.trim().toLowerCase();
  const statusFilter = commissionStatusFilter.value;

  return allCommissions.filter((c) => {

    const vendorName = (c.vendorName || "").toLowerCase();
    const status = c.status === "Collected" ? "Collected" : "Pending";

    const matchesTerm = !term || vendorName.includes(term);
    const matchesStatus = statusFilter === "All" || status === statusFilter;

    return matchesTerm && matchesStatus;

  });

}

function renderCommissionsList() {

  const filtered = getFilteredCommissions();

  commissionCount.textContent = `Total Entries: ${allCommissions.length}`;

  if (!filtered.length) {
    commissionsList.innerHTML = `
      <div class="bf-card" style="padding:20px;">
        No commission entries found.
      </div>
    `;
    return;
  }

  commissionsList.innerHTML = filtered.map((c) => {

    const status = c.status === "Collected" ? "Collected" : "Pending";

    return `
      <div class="bf-card" style="padding:16px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">

        <div>
          <div style="font-weight:700;">
            ${escapeHtml(c.vendorName || "Vendor")}
          </div>

          <div style="font-size:13px; opacity:.7; margin-top:2px;">
            Order: ₹${escapeHtml(String(c.orderAmount ?? 0))} · Rate: ${escapeHtml(String(c.commissionRate ?? 0))}% · Commission: ₹${escapeHtml(String(c.commissionAmount ?? 0))}
          </div>

          ${c.note ? `
            <div style="font-size:12px; opacity:.6; margin-top:2px;">
              📝 ${escapeHtml(c.note)}
            </div>
          ` : ""}

          <div style="font-size:12px; opacity:.55; margin-top:2px;">
            ${formatDate(c.createdAt)}
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:10px;">

          <span class="bf-status-pill ${statusPillClass(status)}">
            ${status}
          </span>

          ${status === "Pending" ? `
            <button
              type="button"
              class="bf-btn bf-btn-ghost bf-btn-sm mark-collected-btn"
              data-id="${escapeHtml(c.id)}">
              Mark Collected
            </button>
          ` : ""}

          <button
            type="button"
            class="bf-btn bf-btn-ghost bf-btn-sm delete-commission-btn"
            data-id="${escapeHtml(c.id)}"
            style="color:#c62828;">
            🗑️
          </button>

        </div>

      </div>
    `;

  }).join("");

}

if (commissionSearch) commissionSearch.addEventListener("input", renderCommissionsList);
if (commissionStatusFilter) commissionStatusFilter.addEventListener("change", renderCommissionsList);

if (commissionsList) {
  commissionsList.addEventListener("click", (e) => {

    const markBtn = e.target.closest(".mark-collected-btn");
    if (markBtn) {
      markCollected(markBtn.dataset.id);
      return;
    }

    const deleteBtn = e.target.closest(".delete-commission-btn");
    if (deleteBtn) {
      deleteCommission(deleteBtn.dataset.id);
    }

  });
}


/* =========================
   MARK COLLECTED
========================= */

async function markCollected(commissionId) {

  const commission = allCommissions.find(c => c.id === commissionId);
  if (!commission) return;

  const ok = window.confirm(
    `Mark ₹${commission.commissionAmount || 0} commission from ${commission.vendorName || "this vendor"} as collected?`
  );
  if (!ok) return;

  try {

    await updateDoc(doc(db, "commissions", commissionId), {
      status: "Collected",
      collectedAt: serverTimestamp()
    });

    await logAdminAction("Marked commission collected", "Commissions", { commissionId });

    const idx = allCommissions.findIndex(c => c.id === commissionId);
    if (idx !== -1) {
      allCommissions[idx] = { ...allCommissions[idx], status: "Collected" };
    }

    renderSummary();
    renderCommissionsList();
    showToast("Commission marked as collected", "success");

  } catch (error) {

    console.error("Mark collected error:", error);
    showToast(error.message || "Failed to update commission.", "danger");

  }

}


/* =========================
   DELETE
========================= */

async function deleteCommission(commissionId) {

  const ok = window.confirm("Delete this commission entry? This cannot be undone.");
  if (!ok) return;

  try {

    await deleteDoc(doc(db, "commissions", commissionId));

    await logAdminAction("Deleted commission", "Commissions", { commissionId });

    allCommissions = allCommissions.filter(c => c.id !== commissionId);

    renderSummary();
    renderCommissionsList();
    showToast("Commission entry deleted", "success");

  } catch (error) {

    console.error("Delete commission error:", error);
    showToast(error.message || "Failed to delete commission entry.", "danger");

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

  await loadVendors();
  loadCommissions();

});
