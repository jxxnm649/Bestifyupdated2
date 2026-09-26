import { auth, db } from "../firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import {
  openModal,
  closeModal,
  showToast
} from "../design-system.js";

import { logAdminAction } from "./audit.js";


const paymentsSummary = document.getElementById("paymentsSummary");

const paymentsTabBtn = document.getElementById("paymentsTabBtn");
const refundsTabBtn = document.getElementById("refundsTabBtn");
const paymentsPanel = document.getElementById("paymentsPanel");
const refundsPanel = document.getElementById("refundsPanel");

const paymentSearch = document.getElementById("paymentSearch");
const paymentMethodFilter = document.getElementById("paymentMethodFilter");
const paymentStatusFilter = document.getElementById("paymentStatusFilter");
const paymentsCount = document.getElementById("paymentsCount");
const paymentsList = document.getElementById("paymentsList");

const refundsCount = document.getElementById("refundsCount");
const refundsList = document.getElementById("refundsList");

const refundFormModal = document.getElementById("refundFormModal");
const refundFormCloseBtn = document.getElementById("refundFormCloseBtn");
const refundForm = document.getElementById("refundForm");
const refundOrderLabel = document.getElementById("refundOrderLabel");
const refundAmount = document.getElementById("refundAmount");
const refundReason = document.getElementById("refundReason");
const refundFormSubmitBtn = document.getElementById("refundFormSubmitBtn");

const PAYMENT_STATUS_OPTIONS = ["Pending", "Paid", "Failed", "Refunded"];

let allOrders = [];
let allRefunds = [];
let refundOrderId = null;


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

function paymentStatusOf(order) {
  return order.paymentStatus || (order.status === "Cancelled" ? "Pending" : "Pending");
}

function statusPillClass(status) {
  if (status === "Failed") return "bf-status-danger";
  if (status === "Paid") return "bf-status-success";
  if (status === "Refunded") return "bf-status-progress";
  return "bf-status-pending";
}


/* =========================
   TABS
========================= */

function showPaymentsTab() {
  paymentsPanel.style.display = "";
  refundsPanel.style.display = "none";
  paymentsTabBtn.className = "bf-btn bf-btn-primary bf-btn-sm";
  refundsTabBtn.className = "bf-btn bf-btn-ghost bf-btn-sm";
}

function showRefundsTab() {
  paymentsPanel.style.display = "none";
  refundsPanel.style.display = "";
  refundsTabBtn.className = "bf-btn bf-btn-primary bf-btn-sm";
  paymentsTabBtn.className = "bf-btn bf-btn-ghost bf-btn-sm";
}

paymentsTabBtn.addEventListener("click", showPaymentsTab);
refundsTabBtn.addEventListener("click", showRefundsTab);

if (window.location.hash === "#refunds") {
  showRefundsTab();
}


/* =========================
   LOAD DATA
========================= */

async function loadOrders() {

  try {

    let snapshot;

    try {
      snapshot = await getDocs(
        query(collection(db, "orders"), orderBy("createdAt", "desc"))
      );
    } catch {
      snapshot = await getDocs(collection(db, "orders"));
    }

    allOrders = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    renderSummary();
    renderPaymentsList();

  } catch (error) {

    console.error("Orders loading error:", error);

    paymentsList.innerHTML = `
      <div class="bf-card" style="padding:20px;">
        ❌ Unable to load payments.
      </div>
    `;

  }

}

async function loadRefunds() {

  try {

    let snapshot;

    try {
      snapshot = await getDocs(
        query(collection(db, "refunds"), orderBy("createdAt", "desc"))
      );
    } catch {
      snapshot = await getDocs(collection(db, "refunds"));
    }

    allRefunds = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    renderRefundsList();

  } catch (error) {

    console.error("Refunds loading error:", error);

    refundsList.innerHTML = `
      <div class="bf-card" style="padding:20px;">
        ❌ Unable to load refunds.
      </div>
    `;

  }

}


/* =========================
   SUMMARY CARDS
========================= */

function renderSummary() {

  const totalCollected = allOrders
    .filter(o => paymentStatusOf(o) === "Paid")
    .reduce((sum, o) => sum + Number(o.total ?? o.totalPrice ?? 0), 0);

  const pendingCount = allOrders.filter(o => paymentStatusOf(o) === "Pending").length;
  const failedCount = allOrders.filter(o => paymentStatusOf(o) === "Failed").length;
  const refundedCount = allOrders.filter(o => paymentStatusOf(o) === "Refunded").length;

  paymentsSummary.innerHTML = `

    <div class="bf-card" style="padding:12px 16px;">
      <div style="font-size:12px; opacity:.65;">Total Collected</div>
      <div style="font-size:18px; font-weight:700;">₹${totalCollected.toLocaleString("en-IN")}</div>
    </div>

    <div class="bf-card" style="padding:12px 16px;">
      <div style="font-size:12px; opacity:.65;">Pending Payments</div>
      <div style="font-size:18px; font-weight:700;">${pendingCount}</div>
    </div>

    <div class="bf-card" style="padding:12px 16px;">
      <div style="font-size:12px; opacity:.65;">Failed Payments</div>
      <div style="font-size:18px; font-weight:700;">${failedCount}</div>
    </div>

    <div class="bf-card" style="padding:12px 16px;">
      <div style="font-size:12px; opacity:.65;">Refunded Orders</div>
      <div style="font-size:18px; font-weight:700;">${refundedCount}</div>
    </div>

  `;

}


/* =========================
   PAYMENTS LIST
========================= */

function getFilteredOrders() {

  const term = paymentSearch.value.trim().toLowerCase();
  const methodFilter = paymentMethodFilter.value;
  const statusFilter = paymentStatusFilter.value;

  return allOrders.filter((order) => {

    const name = (order.customerName || "").toLowerCase();
    const mobile = (order.mobile || "").toLowerCase();
    const idMatch = order.id.toLowerCase().includes(term);

    const matchesTerm = !term || name.includes(term) || mobile.includes(term) || idMatch;
    const matchesMethod = methodFilter === "All" || (order.paymentMethod || "cod") === methodFilter;
    const matchesStatus = statusFilter === "All" || paymentStatusOf(order) === statusFilter;

    return matchesTerm && matchesMethod && matchesStatus;

  });

}

function renderPaymentsList() {

  const filtered = getFilteredOrders();

  paymentsCount.textContent = `Total Orders: ${allOrders.length}`;

  if (!filtered.length) {
    paymentsList.innerHTML = `
      <div class="bf-card" style="padding:20px;">
        No payments found.
      </div>
    `;
    return;
  }

  paymentsList.innerHTML = filtered.map((order) => {

    const total = order.total ?? order.totalPrice ?? 0;
    const pStatus = paymentStatusOf(order);
    const method = order.paymentMethod === "cod" ? "Cash on Delivery" : "Paid Online";

    return `
      <div class="bf-card" style="padding:16px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">

        <div>
          <div style="font-weight:700;">
            #${escapeHtml(order.id.slice(0, 8).toUpperCase())}
            &nbsp;·&nbsp;
            ${escapeHtml(order.customerName || "Customer")}
          </div>

          <div style="font-size:13px; opacity:.7; margin-top:2px;">
            ${escapeHtml(method)} · ₹${escapeHtml(String(total))}
            ${order.paymentId ? ` · Txn: ${escapeHtml(order.paymentId)}` : ""}
          </div>

          <div style="font-size:12px; opacity:.55; margin-top:2px;">
            ${formatDate(order.createdAt)}
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">

          <span class="bf-status-pill ${statusPillClass(pStatus)}">
            ${escapeHtml(pStatus)}
          </span>

          <select class="bf-select payment-status-select" data-id="${escapeHtml(order.id)}" style="max-width:140px;">
            ${PAYMENT_STATUS_OPTIONS.map(opt =>
              `<option value="${opt}" ${pStatus === opt ? "selected" : ""}>${opt}</option>`
            ).join("")}
          </select>

          <button
            type="button"
            class="bf-btn bf-btn-ghost bf-btn-sm apply-payment-status-btn"
            data-id="${escapeHtml(order.id)}">
            Apply
          </button>

        </div>

      </div>
    `;

  }).join("");

}

if (paymentSearch) paymentSearch.addEventListener("input", renderPaymentsList);
if (paymentMethodFilter) paymentMethodFilter.addEventListener("change", renderPaymentsList);
if (paymentStatusFilter) paymentStatusFilter.addEventListener("change", renderPaymentsList);

if (paymentsList) {
  paymentsList.addEventListener("click", (e) => {

    const btn = e.target.closest(".apply-payment-status-btn");
    if (!btn) return;

    const id = btn.dataset.id;
    const select = paymentsList.querySelector(`.payment-status-select[data-id="${id}"]`);
    const newStatus = select.value;

    if (newStatus === "Refunded") {
      openRefundModal(id);
      return;
    }

    applyPaymentStatus(id, newStatus);

  });
}

async function applyPaymentStatus(id, newStatus) {

  try {

    await updateDoc(doc(db, "orders", id), { paymentStatus: newStatus });

    await logAdminAction("Updated payment status", "Payments", { orderId: id, newStatus });

    const idx = allOrders.findIndex(o => o.id === id);
    if (idx !== -1) {
      allOrders[idx] = { ...allOrders[idx], paymentStatus: newStatus };
    }

    renderSummary();
    renderPaymentsList();
    showToast("Payment status updated", "success");

  } catch (error) {

    console.error("Payment status update error:", error);
    showToast(error.message || "Failed to update payment status.", "danger");

  }

}


/* =========================
   REFUND MODAL
========================= */

function openRefundModal(orderId) {

  const order = allOrders.find(o => o.id === orderId);
  if (!order) return;

  refundOrderId = orderId;

  refundOrderLabel.value =
    `#${orderId.slice(0, 8).toUpperCase()} — ${order.customerName || "Customer"}`;

  refundAmount.value = order.total ?? order.totalPrice ?? 0;
  refundReason.value = "";

  openModal("refundFormModal");

}

if (refundFormCloseBtn) {
  refundFormCloseBtn.addEventListener("click", () => {
    closeModal("refundFormModal");
    renderPaymentsList();
  });
}

refundForm.addEventListener("submit", async (e) => {

  e.preventDefault();

  if (!refundOrderId) return;

  const order = allOrders.find(o => o.id === refundOrderId);
  if (!order) return;

  refundFormSubmitBtn.disabled = true;
  refundFormSubmitBtn.textContent = "Processing...";

  try {

    await addDoc(collection(db, "refunds"), {
      orderId: refundOrderId,
      userId: order.userId || null,
      customerName: order.customerName || "Customer",
      mobile: order.mobile || "",
      amount: Number(refundAmount.value) || 0,
      reason: refundReason.value.trim(),
      status: "Refunded",
      createdAt: serverTimestamp()
    });

    await updateDoc(doc(db, "orders", refundOrderId), { paymentStatus: "Refunded" });

    await logAdminAction("Issued refund", "Payments", {
      orderId: refundOrderId,
      amount: Number(refundAmount.value) || 0
    });

    const idx = allOrders.findIndex(o => o.id === refundOrderId);
    if (idx !== -1) {
      allOrders[idx] = { ...allOrders[idx], paymentStatus: "Refunded" };
    }

    renderSummary();
    renderPaymentsList();
    closeModal("refundFormModal");
    showToast("Refund processed", "success");

    refundOrderId = null;

  } catch (error) {

    console.error("Refund error:", error);
    showToast(error.message || "Failed to process refund.", "danger");

  } finally {

    refundFormSubmitBtn.disabled = false;
    refundFormSubmitBtn.textContent = "Confirm Refund";

  }

});


/* =========================
   REFUNDS LIST
========================= */

function renderRefundsList() {

  refundsCount.textContent = `Total Refunds: ${allRefunds.length}`;

  if (!allRefunds.length) {
    refundsList.innerHTML = `
      <div class="bf-card" style="padding:20px;">
        No refunds yet.
      </div>
    `;
    return;
  }

  refundsList.innerHTML = allRefunds.map((refund) => `

    <div class="bf-card" style="padding:16px;">

      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">

        <div>
          <div style="font-weight:700;">
            ${escapeHtml(refund.customerName || "Customer")}
            &nbsp;·&nbsp;
            Order #${escapeHtml((refund.orderId || "").slice(0, 8).toUpperCase())}
          </div>

          <div style="font-size:13px; opacity:.7; margin-top:2px;">
            ₹${escapeHtml(String(refund.amount ?? 0))} refunded
            ${refund.mobile ? ` · ${escapeHtml(refund.mobile)}` : ""}
          </div>

          ${refund.reason ? `
            <div style="font-size:13px; opacity:.7; margin-top:4px;">
              Reason: ${escapeHtml(refund.reason)}
            </div>
          ` : ""}

          <div style="font-size:12px; opacity:.55; margin-top:4px;">
            ${formatDate(refund.createdAt)}
          </div>
        </div>

        <span class="bf-status-pill bf-status-progress">Refunded</span>

      </div>

    </div>

  `).join("");

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

  loadOrders();
  loadRefunds();

});
