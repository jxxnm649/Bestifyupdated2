import { db } from "../firebase.js";

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { showToast } from "../design-system.js";
import { guardVendorPage, wireLogout } from "./vendor-common.js";

wireLogout(document.getElementById("logoutBtn"));

const ordersList = document.getElementById("ordersList");
const orderCount = document.getElementById("orderCount");
const orderSearch = document.getElementById("orderSearch");
const orderStatusFilter = document.getElementById("orderStatusFilter");

// A vendor moves its OWN sub-order forward one step at a time. These
// transitions mirror firestore.rules exactly — anything else is
// rejected server-side, not just hidden here.
const VENDOR_ALLOWED_NEXT_STATUS = {
  "PLACED": "CONFIRMED",
  "CONFIRMED": "PROCESSING",
  "PROCESSING": "PACKED",
  "PACKED": "SHIPPED",
  "SHIPPED": "DELIVERED"
};

let allOrders = [];
let currentVendorId = null;

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function formatDate(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

function statusPillClass(status) {
  if (status === "CANCELLED") return "bf-status-danger";
  if (status === "DELIVERED") return "bf-status-success";
  return "bf-status-pending";
}

async function loadOrders() {

  try {

    const snapshot = await getDocs(
      query(collection(db, "subOrders"), where("vendorId", "==", currentVendorId))
    );

    allOrders = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    renderOrders();

  } catch (error) {
    console.error("Vendor orders load error:", error);
    ordersList.innerHTML = `<div class="bf-card" style="padding:20px;">❌ Unable to load orders.</div>`;
  }

}

function getFiltered() {

  const term = orderSearch.value.trim().toLowerCase();
  const statusFilter = orderStatusFilter.value;

  return allOrders.filter((order) => {
    const name = (order.customerName || "").toLowerCase();
    const matchesTerm = !term || name.includes(term) || order.id.toLowerCase().includes(term);
    const matchesStatus = statusFilter === "All" || order.status === statusFilter;
    return matchesTerm && matchesStatus;
  });

}

function renderOrders() {

  const filtered = getFiltered();

  orderCount.textContent = `Your Orders: ${allOrders.length}`;

  if (!filtered.length) {
    ordersList.innerHTML = `<div class="bf-card" style="padding:20px;">No orders found.</div>`;
    return;
  }

  ordersList.innerHTML = filtered.map((order) => {

    // A sub-order document already contains only this vendor's lines —
    // no client-side filtering needed, and no other vendor's data was
    // ever sent to this browser.
    const myItems = order.products || [];

    const itemsHtml = myItems.map(p => `
      <div style="display:flex;gap:10px;align-items:center;padding:6px 0;">
        <img src="${escapeHtml(p.productImage || "")}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;">
        <div style="font-size:13px;">
          ${escapeHtml(p.productName || "")}${(p.quantity || 1) > 1 ? ` × ${p.quantity}` : ""}
          <div style="opacity:.65;">₹${escapeHtml(String(p.unitPrice ?? 0))}</div>
        </div>
      </div>
    `).join("");

    const nextStatus = VENDOR_ALLOWED_NEXT_STATUS[order.status];

    return `
      <div class="bf-card" style="padding:16px;">

        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <div>
            <div style="font-weight:700;">#${escapeHtml(String(order.subOrderNumber || order.id.slice(0, 8).toUpperCase()))}</div>
            <div style="font-size:12px;opacity:.65;">${formatDate(order.createdAt)} · ${escapeHtml(order.customerName || "Customer")}</div>
          </div>
          <span class="bf-status-pill ${statusPillClass(order.status)}">${escapeHtml(order.status || "Pending")}</span>
        </div>

        <div style="margin-top:10px;border-top:1px solid var(--line);padding-top:8px;">
          ${itemsHtml || "<div style='font-size:13px;opacity:.6;'>No items from your shop in this order.</div>"}
        </div>

        <div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--line);font-size:12.5px;display:flex;justify-content:space-between;">
          <span style="opacity:.7;">Order ₹${escapeHtml(String(order.itemsTotal ?? 0))} − ${escapeHtml(String(order.commissionRate ?? 0))}% commission</span>
          <b style="color:var(--leaf,#2F7A4F);">You earn ₹${escapeHtml(String(order.vendorPayable ?? 0))}</b>
        </div>

        ${nextStatus ? `
          <button
            type="button"
            class="bf-btn bf-btn-ghost bf-btn-sm advance-status-btn"
            data-id="${escapeHtml(order.id)}"
            data-next="${nextStatus}"
            style="margin-top:10px;">
            Mark as ${nextStatus}
          </button>
        ` : ""}

      </div>
    `;

  }).join("");

}

orderSearch.addEventListener("input", renderOrders);
orderStatusFilter.addEventListener("change", renderOrders);

ordersList.addEventListener("click", async (e) => {

  const btn = e.target.closest(".advance-status-btn");
  if (!btn) return;

  const id = btn.dataset.id;
  const nextStatus = btn.dataset.next;

  btn.disabled = true;
  btn.textContent = "Updating...";

  try {

    // Only status / statusHistory / updatedAt are writable by a vendor
    // (firestore.rules). Financial fields can't be touched from here.
    await updateDoc(doc(db, "subOrders", id), {
      status: nextStatus,
      statusHistory: arrayUnion({
        status: nextStatus,
        at: new Date(),
        by: "vendor",
        actorId: currentVendorId
      }),
      updatedAt: new Date()
    });

    const idx = allOrders.findIndex(o => o.id === id);
    if (idx !== -1) allOrders[idx].status = nextStatus;

    renderOrders();
    showToast(`Order marked as ${nextStatus}`, "success");

  } catch (error) {
    console.error("Order status update error:", error);
    showToast(error.message || "Failed to update order.", "danger");
    btn.disabled = false;
    btn.textContent = `Mark as ${nextStatus}`;
  }

});

guardVendorPage((user) => {
  currentVendorId = user.uid;
  loadOrders();
});
