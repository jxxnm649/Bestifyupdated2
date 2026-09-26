/* ============================================================
   Admin home — orders panel.

   Real orders from Firestore. Status changes go through the shared
   setOrderStatus() so the cashback credit/void rules are identical
   to the Orders page — no second copy of the money logic.
   ============================================================ */

import { auth, db } from "../firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { showToast } from "../design-system.js";
import { setOrderStatus } from "./order-status.js";
import { normalizeOrder } from "../order-compat.js";


const TABS = [
  "All", "Pending", "Confirmed", "Packed",
  "Shipped", "Out for Delivery", "Delivered", "Cancelled"
];

const listEl = document.getElementById("hopList");
const tabsEl = document.getElementById("hopTabs");
const searchEl = document.getElementById("hopSearch");
const selectAllEl = document.getElementById("hopSelectAll");
const selectedCountEl = document.getElementById("hopSelectedCount");

const modalEl = document.getElementById("hopUpdateModal");
const modalForm = document.getElementById("hopUpdateForm");

let allOrders = [];
let currentFilter = "All";
let selectedIds = new Set();

// The panel only exists on the admin home page.
if (listEl) initPanel();


function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[m]);
}

function statusClass(status) {
  return "hop-st-" + String(status || "Pending").toLowerCase().replace(/\s+/g, "");
}

function orderTime(o) {
  return o.createdAt?.toDate ? o.createdAt.toDate().getTime() : new Date(o.createdAt || 0).getTime();
}

// Digits only, with country code, for tel:/wa.me links.
function phoneDigits(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length === 10 ? "91" + digits : digits;
}


function initPanel() {

  onAuthStateChanged(auth, async (user) => {
    if (!user) return; // admin.js already handles the auth-gate UI
    await loadOrders();
  });

  tabsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".hop-tab-btn");
    if (!btn) return;
    currentFilter = btn.dataset.status;
    renderTabs();
    renderList();
  });

  searchEl.addEventListener("input", renderList);

  selectAllEl.addEventListener("change", () => {
    const visible = getFilteredOrders();
    if (selectAllEl.checked) visible.forEach(o => selectedIds.add(o.id));
    else visible.forEach(o => selectedIds.delete(o.id));
    renderList();
  });

  document.getElementById("hopBulkAccept").addEventListener("click", bulkAccept);
  document.getElementById("hopBulkWhatsapp").addEventListener("click", bulkWhatsapp);

  document.getElementById("hopModalClose").addEventListener("click", closeModal);
  modalEl.addEventListener("click", (e) => { if (e.target === modalEl) closeModal(); });
  modalForm.addEventListener("submit", saveModal);

  listEl.addEventListener("click", onListClick);
  listEl.addEventListener("change", onListChange);

}


async function loadOrders() {

  try {

    const snap = await getDocs(collection(db, "orders"));
    allOrders = snap.docs
      .map(d => normalizeOrder({ id: d.id, ...d.data() }))
      .sort((a, b) => orderTime(b) - orderTime(a));

    renderTabs();
    renderList();

  } catch (error) {
    console.error("Orders load error:", error);
    listEl.innerHTML = `<div class="hop-empty">Couldn't load orders. Please refresh.</div>`;
  }

}


function getFilteredOrders() {

  const q = (searchEl.value || "").toLowerCase().trim();

  return allOrders.filter(o => {

    if (currentFilter !== "All" && (o.status || "Pending") !== currentFilter) return false;
    if (!q) return true;

    const firstProduct = (o.products || [])[0] || {};
    const haystack = [
      o.orderNumber, o.id, o.customerName, o.mobile, firstProduct.productName
    ].map(v => String(v ?? "").toLowerCase()).join(" ");

    return haystack.includes(q);

  });

}


function renderTabs() {

  const counts = { All: allOrders.length };
  allOrders.forEach(o => {
    const s = o.status || "Pending";
    counts[s] = (counts[s] || 0) + 1;
  });

  tabsEl.innerHTML = TABS.map(t => `
    <button type="button" class="hop-tab-btn ${t === currentFilter ? "active" : ""}" data-status="${t}">
      ${t} <span class="hop-badge">${counts[t] || 0}</span>
    </button>
  `).join("");

}


function renderList() {

  const orders = getFilteredOrders();

  if (!orders.length) {
    listEl.innerHTML = `
      <div class="hop-empty">
        <i class="fa-solid fa-box-open" style="font-size:26px;display:block;margin-bottom:8px;color:#94a3b8;"></i>
        No ${currentFilter === "All" ? "" : currentFilter + " "}orders found.
      </div>`;
    updateSelectedCount();
    return;
  }

  listEl.innerHTML = orders.map(orderCardHTML).join("");
  updateSelectedCount();

}


function orderCardHTML(o) {

  const p = (o.products || [])[0] || {};
  const itemCount = (o.products || []).length;
  const status = o.status || "Pending";
  const isAccepted = !["Pending", "Cancelled"].includes(status);
  const isCOD = o.paymentMethod === "cod";
  const wa = phoneDigits(o.mobile);
  const qty = p.qty || 1;
  const mrp = Number(p.mrp) || 0;
  const price = Number(p.price) || 0;

  return `
  <div class="hop-card ${isAccepted ? "accepted" : ""}" data-id="${o.id}">

    <div class="hop-card-top">
      <div class="hop-card-top-left">
        <input type="checkbox" class="hop-check" ${selectedIds.has(o.id) ? "checked" : ""}>
        <span>Order #${escapeHtml(o.orderNumber || o.id.slice(0, 8).toUpperCase())}</span>
      </div>
      <label class="hop-accept-switch ${isAccepted ? "done" : ""}">
        <input type="checkbox" class="hop-accept" ${isAccepted ? "checked" : ""} ${status === "Cancelled" ? "disabled" : ""}>
        <span>${isAccepted ? "Accepted" : "Accept Order"}</span>
      </label>
    </div>

    <div class="hop-card-user">
      <div class="hop-user-avatar"><i class="fa-solid fa-user"></i></div>
      <span class="hop-user-name">${escapeHtml(o.customerName || "Customer")}</span>
    </div>

    <div class="hop-card-body">
      ${p.image
        ? `<img src="${escapeHtml(p.image)}" alt="" class="hop-product-img">`
        : `<div class="hop-product-img"></div>`}
      <div class="hop-product-details">
        <div class="hop-product-title">${escapeHtml(p.productName || "Product")}${itemCount > 1 ? ` +${itemCount - 1} more` : ""}</div>
        <div><strong>Qty:</strong> ${qty}</div>
        <div class="hop-price-line">
          <strong>Price:</strong>
          ${mrp > price ? `<span style="text-decoration:line-through;color:#94a3b8;font-size:12px;">₹${mrp}</span>` : ""}
          <span class="hop-selling-price">₹${o.total ?? price}</span>
        </div>
        <div>
          <span class="hop-pay-badge ${isCOD ? "" : "paid"}">${isCOD ? "COD" : "PAID"}</span>
          <span class="hop-status-badge ${statusClass(status)}">${escapeHtml(status)}</span>
        </div>
      </div>
    </div>

    <div class="hop-card-footer">
      <div class="hop-phone">${escapeHtml(o.mobile || "—")}</div>
      <div class="hop-icons">
        ${wa ? `<a href="sms:+${wa}" class="hop-icon-btn sms" title="SMS"><i class="fa-solid fa-comment-sms"></i></a>` : ""}
        ${wa ? `<a href="tel:+${wa}" class="hop-icon-btn phone" title="Call"><i class="fa-solid fa-phone"></i></a>` : ""}
        ${wa ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener" class="hop-icon-btn whatsapp" title="WhatsApp"><i class="fa-brands fa-whatsapp"></i></a>` : ""}
        <button type="button" class="hop-icon-btn update hop-update-btn" title="Update Order">
          <i class="fa-solid fa-sliders"></i>
        </button>
      </div>
    </div>

  </div>`;

}


function onListChange(e) {

  const card = e.target.closest(".hop-card");
  if (!card) return;
  const orderId = card.dataset.id;

  if (e.target.classList.contains("hop-check")) {
    if (e.target.checked) selectedIds.add(orderId);
    else selectedIds.delete(orderId);
    updateSelectedCount();
    return;
  }

  if (e.target.classList.contains("hop-accept")) {
    // Unchecking doesn't "un-accept" — moving an order backwards is a
    // real status change, so that goes through the Update dialog.
    if (!e.target.checked) {
      e.target.checked = true;
      showToast("To move an order back, use the Update button.", "danger");
      return;
    }
    applyStatus(orderId, "Confirmed");
  }

}


function onListClick(e) {

  const btn = e.target.closest(".hop-update-btn");
  if (!btn) return;

  const orderId = btn.closest(".hop-card").dataset.id;
  openModal(orderId);

}


function updateSelectedCount() {

  const visible = getFilteredOrders();
  const visibleSelected = visible.filter(o => selectedIds.has(o.id)).length;

  selectedCountEl.textContent = visibleSelected;
  selectAllEl.checked = visible.length > 0 && visibleSelected === visible.length;

}


async function applyStatus(orderId, newStatus) {

  try {

    const { cashbackWarning } = await setOrderStatus(orderId, newStatus);

    const idx = allOrders.findIndex(o => o.id === orderId);
    if (idx !== -1) allOrders[idx] = { ...allOrders[idx], status: newStatus };

    renderTabs();
    renderList();

    if (cashbackWarning) showToast(cashbackWarning, "danger");
    else showToast(`Order marked ${newStatus}`, "success");

  } catch (error) {
    console.error(error);
    showToast(error.message || "Couldn't update the order.", "danger");
    renderList();
  }

}


async function bulkAccept() {

  const targets = getFilteredOrders()
    .filter(o => selectedIds.has(o.id) && (o.status || "Pending") === "Pending");

  if (!targets.length) {
    showToast("Select one or more Pending orders first.", "danger");
    return;
  }

  const btn = document.getElementById("hopBulkAccept");
  btn.disabled = true;

  let done = 0;
  let failed = 0;

  for (const o of targets) {
    try {
      await setOrderStatus(o.id, "Confirmed");
      const idx = allOrders.findIndex(x => x.id === o.id);
      if (idx !== -1) allOrders[idx] = { ...allOrders[idx], status: "Confirmed" };
      done++;
    } catch (error) {
      console.error(error);
      failed++;
    }
  }

  btn.disabled = false;
  renderTabs();
  renderList();

  if (failed) showToast(`${done} accepted, ${failed} failed — try those again.`, "danger");
  else showToast(`${done} order${done > 1 ? "s" : ""} accepted`, "success");

}


function bulkWhatsapp() {

  const targets = getFilteredOrders().filter(o => selectedIds.has(o.id));

  if (!targets.length) {
    showToast("Select an order first.", "danger");
    return;
  }

  // WhatsApp has no real multi-send link, so this opens the first
  // selected customer rather than pretending to message everyone.
  const wa = phoneDigits(targets[0].mobile);
  if (!wa) {
    showToast("That customer has no phone number saved.", "danger");
    return;
  }

  if (targets.length > 1) {
    showToast("WhatsApp opens one chat at a time — opening the first selected.", "success");
  }

  window.open(`https://wa.me/${wa}`, "_blank", "noopener");

}


function openModal(orderId) {

  const order = allOrders.find(o => o.id === orderId);
  if (!order) return;

  document.getElementById("hopModalOrderId").value = orderId;
  document.getElementById("hopModalOrderNo").value = "#" + (order.orderNumber || orderId.slice(0, 8).toUpperCase());
  document.getElementById("hopModalCustomer").value = order.customerName || "Customer";
  document.getElementById("hopModalStatus").value = order.status || "Pending";

  modalEl.classList.add("open");

}


function closeModal() {
  modalEl.classList.remove("open");
}


async function saveModal(e) {

  e.preventDefault();

  const orderId = document.getElementById("hopModalOrderId").value;
  const newStatus = document.getElementById("hopModalStatus").value;
  const saveBtn = document.getElementById("hopModalSave");

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  await applyStatus(orderId, newStatus);

  saveBtn.disabled = false;
  saveBtn.textContent = "Save Changes";
  closeModal();

}
