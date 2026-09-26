import { auth, db } from "../firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  addDoc,
  setDoc,
  increment,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import {
  openModal,
  closeModal,
  showToast
} from "../design-system.js";

import { logAdminAction } from "./audit.js";
import { setOrderStatus } from "./order-status.js";
import { normalizeOrder } from "../order-compat.js";


const ordersList = document.getElementById("ordersList");
const orderCount = document.getElementById("orderCount");
const orderSearch = document.getElementById("orderSearch");
const orderStatusFilter = document.getElementById("orderStatusFilter");

const orderDetailsModal = document.getElementById("orderDetailsModal");
const orderDetailsCloseBtn = document.getElementById("orderDetailsCloseBtn");
const orderDetailsContent = document.getElementById("orderDetailsContent");

const STATUS_OPTIONS = [
  "Pending", "Confirmed", "Packed", "Shipped",
  "Out for Delivery", "Delivered", "Cancelled"
];

let allOrders = [];
let currentDetailsOrderId = null;
let selectedOrderIds = new Set();


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
  if (status === "Delivered") return "bf-status-success";
  if (status === "Pending") return "bf-status-pending";
  return "bf-status-progress";
}


/* =========================
   LOAD & RENDER
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

    allOrders = snapshot.docs.map((docSnap) => normalizeOrder({
      id: docSnap.id,
      ...docSnap.data()
    }));

    renderOrderList();

  } catch (error) {

    console.error("Orders loading error:", error);

    ordersList.innerHTML = `
      <div class="bf-card" style="padding:20px;">
        ❌ Unable to load orders.
      </div>
    `;

  }

}

function getFilteredOrders() {

  const term = orderSearch.value.trim().toLowerCase();
  const statusFilter = orderStatusFilter.value;

  return allOrders.filter((order) => {

    const name = (order.customerName || "").toLowerCase();
    const mobile = (order.mobile || "").toLowerCase();
    const idMatch = order.id.toLowerCase().includes(term);

    const matchesTerm = !term || name.includes(term) || mobile.includes(term) || idMatch;
    const matchesStatus = statusFilter === "All Status" || order.status === statusFilter;

    return matchesTerm && matchesStatus;

  });

}

function renderOrderList() {

  const filtered = getFilteredOrders();

  orderCount.textContent = `Total Orders: ${allOrders.length}`;

  if (!filtered.length) {
    ordersList.innerHTML = `
      <div class="bf-card" style="padding:20px;">
        No orders found.
      </div>
    `;
    return;
  }

  ordersList.innerHTML = filtered.map((order) => {

    const total = order.total ?? order.totalPrice ?? 0;
    const itemCount = Array.isArray(order.products) ? order.products.length : 0;

    return `
      <div class="bf-card" style="padding:16px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">

        <div style="display:flex; align-items:flex-start; gap:10px;">
          <input type="checkbox" class="order-select-checkbox" data-id="${escapeHtml(order.id)}" ${selectedOrderIds.has(order.id) ? "checked" : ""} style="margin-top:4px; width:18px; height:18px;">

          <div>
            <div style="font-weight:700;">
              #${escapeHtml(String(order.orderNumber || order.id.slice(0, 8).toUpperCase()))}
              &nbsp;·&nbsp;
              ${escapeHtml(order.customerName || "Customer")}
            </div>

            <div style="font-size:13px; opacity:.7; margin-top:2px;">
              ${escapeHtml(order.mobile || "No mobile")} · ${itemCount} item${itemCount === 1 ? "" : "s"} · ₹${escapeHtml(String(total))}
            </div>

            <div style="font-size:12px; opacity:.55; margin-top:2px;">
              ${formatDate(order.createdAt)}
            </div>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:10px;">
          <span class="bf-status-pill ${statusPillClass(order.status)}">
            ${escapeHtml(order.status || "Pending")}
          </span>

          ${order.mobile ? `
            <a href="tel:${escapeHtml(order.mobile)}" class="bf-btn bf-btn-ghost bf-btn-sm" style="text-decoration:none;" title="Call customer">
              📞
            </a>
          ` : ""}

          <button
            type="button"
            class="bf-btn bf-btn-ghost bf-btn-sm view-order-btn"
            data-id="${escapeHtml(order.id)}">
            View
          </button>
        </div>

      </div>
    `;

  }).join("");

  updateBulkBar();

}

if (orderSearch) {
  orderSearch.addEventListener("input", renderOrderList);
}

if (orderStatusFilter) {
  orderStatusFilter.addEventListener("change", renderOrderList);
}


/* =========================
   ORDER DETAILS MODAL
========================= */

let productsCache = null;

async function getProductsCache() {
  if (productsCache) return productsCache;
  try {
    const snap = await getDocs(collection(db, "products"));
    productsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error(error);
    productsCache = [];
  }
  return productsCache;
}

function generateCouponCode() {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `BESTIFY-${rand}`;
}

// Reward UI — replaces the old automatic % cashback. Admin decides,
// per order, either a cash amount (credited to wallet on delivery,
// same flow as before) or a coupon restricted to this one customer
// and one product (auto-applied at their next checkout).
function rewardSectionHTML(order) {

  const hasCash = order.cashbackAmount > 0;
  const hasCoupon = !!order.couponGivenCode;

  if (hasCash || hasCoupon) {
    return `
      <h3 style="font-size:14px; margin:16px 0 8px;">🎁 Reward Given</h3>
      <div class="bf-card" style="padding:12px; margin-bottom:16px; font-size:13px;">
        ${hasCash ? `
          <div><b>Cash Reward:</b> ₹${order.cashbackAmount} — ${order.cashbackStatus === "credited" ? "✓ Credited to wallet" : "Pending (credits when order is Delivered)"}</div>
        ` : ""}
        ${hasCoupon ? `
          <div><b>Coupon:</b> ${escapeHtml(order.couponGivenCode)} — ₹${order.couponGivenDiscount} off "${escapeHtml(order.couponGivenProductName || "product")}" ${order.couponGivenUsed ? "— ✓ Used" : "— not used yet"}</div>
        ` : ""}
      </div>
    `;
  }

  return `
    <h3 style="font-size:14px; margin:16px 0 8px;">🎁 Give a Reward (optional)</h3>
    <div class="bf-card" style="padding:14px; margin-bottom:16px;">

      <div style="display:flex; gap:8px; margin-bottom:12px;">
        <button type="button" class="bf-btn bf-btn-ghost bf-btn-sm reward-type-btn active" data-type="cash" style="flex:1;">💰 Cash</button>
        <button type="button" class="bf-btn bf-btn-ghost bf-btn-sm reward-type-btn" data-type="coupon" style="flex:1;">🎟️ Coupon</button>
      </div>

      <div id="rewardCashPanel">
        <div class="bf-field">
          <label class="bf-label">Cash Amount (₹1 – ₹200)</label>
          <input type="number" id="rewardCashAmount" class="bf-input" min="1" max="200" step="1" placeholder="e.g. 50">
        </div>
        <button type="button" id="giveCashRewardBtn" class="bf-btn bf-btn-primary bf-btn-block">Give Cash Reward</button>
      </div>

      <div id="rewardCouponPanel" style="display:none;">
        <div class="bf-field">
          <label class="bf-label">Product this coupon applies to</label>
          <select id="rewardCouponProduct" class="bf-select">
            <option value="">Loading products...</option>
          </select>
        </div>
        <div class="bf-field">
          <label class="bf-label">Discount Amount (₹)</label>
          <input type="number" id="rewardCouponDiscount" class="bf-input" min="1" step="1" placeholder="e.g. 100">
        </div>
        <div style="font-size:11px; opacity:.6; margin:-4px 0 10px;">Only this customer can use it, only on this product — applied automatically at their checkout, no code needed on their end.</div>
        <button type="button" id="giveCouponRewardBtn" class="bf-btn bf-btn-primary bf-btn-block">Give Coupon Reward</button>
      </div>

    </div>
  `;

}

function renderOrderDetails(order) {

  // v2 orders may carry UPPERCASE statuses — show them the legacy way.
  order = normalizeOrder(order);

  const total = order.total ?? order.totalPrice ?? 0;

  const productsHTML = Array.isArray(order.products) && order.products.length
    ? order.products.map((p) => `
        <div style="display:flex; gap:10px; align-items:center; padding:8px 0; border-bottom:1px solid var(--line, #E4DED2);">
          <img
            src="${escapeHtml(p.image || "")}"
            alt="${escapeHtml(p.productName || "")}"
            style="width:50px; height:50px; object-fit:cover; border-radius:8px;">

          <div style="flex:1;">
            <div style="font-weight:600; font-size:13px;">
              ${escapeHtml(p.productName || "Product")}${p.qty > 1 ? ` × ${escapeHtml(String(p.qty))}` : ""}
            </div>
            ${(p.selectedSize || p.selectedColour) ? `
              <div style="font-size:12px; opacity:.65;">
                ${escapeHtml([p.selectedSize, p.selectedColour].filter(Boolean).join(", "))}
              </div>
            ` : ""}
          </div>

          <div style="font-weight:600; font-size:13px;">
            ₹${escapeHtml(String(p.price ?? ""))}
          </div>
        </div>
      `).join("")
    : `<p style="opacity:.6;">No item details available.</p>`;

  orderDetailsContent.innerHTML = `

    <div style="margin-bottom:14px;">
      <div><b>Order ID:</b> #${escapeHtml(String(order.orderNumber || order.id.slice(0, 8).toUpperCase()))}</div>
      <div><b>Customer:</b> ${escapeHtml(order.customerName || "Customer")}</div>
      <div><b>Mobile:</b> ${escapeHtml(order.mobile || "Not available")}</div>
      <div><b>Address:</b> ${escapeHtml(order.address || "Not available")}</div>
      <div><b>Payment:</b> ${order.paymentMethod === "cod" ? "Cash on Delivery" : "Paid Online"}</div>
      <div><b>Total:</b> ₹${escapeHtml(String(total))}</div>
      <div><b>Placed on:</b> ${formatDate(order.createdAt)}</div>
    </div>

    ${order.mobile ? `
      <a href="tel:${escapeHtml(order.mobile)}" style="text-decoration:none;">
        <button type="button" class="bf-btn bf-btn-primary bf-btn-block" style="margin-bottom:14px;">
          📞 Call Customer to Confirm
        </button>
      </a>
    ` : ""}

    <h3 style="font-size:14px; margin:16px 0 8px;">🛍️ Items</h3>
    <div style="margin-bottom:16px;">
      ${productsHTML}
    </div>

    ${rewardSectionHTML(order)}

    ${(order.status === "Pending" || order.status === "Confirmed") ? `
      <h3 style="font-size:14px; margin:16px 0 8px;">☎️ After calling the customer</h3>
      <p style="font-size:12px; opacity:.65; margin:-4px 0 10px;">Confirm the order only after you've spoken to the customer on the phone.</p>
      <div style="display:flex; gap:8px; margin-bottom:16px;">
        <button type="button" id="quickAcceptBtn" class="bf-btn bf-btn-primary" style="flex:1;">✅ Accept Order</button>
        <button type="button" id="quickRejectBtn" class="bf-btn bf-btn-ghost" style="flex:1;color:#c62828;">❌ Reject Order</button>
      </div>
    ` : ""}

    <h3 style="font-size:14px; margin:16px 0 8px;">📦 Update Status</h3>

    <div class="bf-field">
      <select id="orderStatusSelect" class="bf-select">
        ${STATUS_OPTIONS.map(s =>
          `<option value="${s}" ${order.status === s ? "selected" : ""}>${s}</option>`
        ).join("")}
      </select>
    </div>

    <button
      type="button"
      id="updateOrderStatusBtn"
      class="bf-btn bf-btn-primary bf-btn-block">
      Update Status
    </button>

  `;

}

if (ordersList) {
  ordersList.addEventListener("click", (e) => {

    const viewBtn = e.target.closest(".view-order-btn");
    if (!viewBtn) return;

    const id = viewBtn.dataset.id;
    const order = allOrders.find(o => o.id === id);
    if (!order) return;

    currentDetailsOrderId = id;
    renderOrderDetails(order);
    openModal("orderDetailsModal");

  });
}

if (orderDetailsCloseBtn) {
  orderDetailsCloseBtn.addEventListener("click", () => {
    closeModal("orderDetailsModal");
  });
}

async function applyOrderStatus(newStatus, triggerBtn, defaultLabel) {

  triggerBtn.disabled = true;
  triggerBtn.textContent = "Updating...";

  try {

    // Status + cashback rules live in order-status.js so this page and
    // the admin home orders panel can never drift apart.
    const { cashbackWarning } = await setOrderStatus(currentDetailsOrderId, newStatus);

    const idx = allOrders.findIndex(o => o.id === currentDetailsOrderId);
    if (idx !== -1) {
      allOrders[idx] = { ...allOrders[idx], status: newStatus };
    }

    renderOrderList();
    if (cashbackWarning) showToast(cashbackWarning, "danger");
    else showToast("Order status updated", "success");
    closeModal("orderDetailsModal");

  } catch (error) {

    console.error("Order status update error:", error);
    showToast(error.message || "Failed to update status.", "danger");

  } finally {

    triggerBtn.disabled = false;
    triggerBtn.textContent = defaultLabel;

  }

}

if (orderDetailsContent) {
  orderDetailsContent.addEventListener("click", async (e) => {

    if (e.target.id === "updateOrderStatusBtn") {
      const select = document.getElementById("orderStatusSelect");
      await applyOrderStatus(select.value, e.target, "Update Status");
      return;
    }

    if (e.target.id === "quickAcceptBtn") {
      await applyOrderStatus("Confirmed", e.target, "✅ Accept Order");
      return;
    }

    if (e.target.id === "quickRejectBtn") {
      const sure = confirm("Reject this order? This cancels it for the customer.");
      if (!sure) return;
      await applyOrderStatus("Cancelled", e.target, "❌ Reject Order");
      return;
    }

    const typeBtn = e.target.closest(".reward-type-btn");
    if (typeBtn) {
      orderDetailsContent.querySelectorAll(".reward-type-btn").forEach(b => b.classList.toggle("active", b === typeBtn));
      const isCoupon = typeBtn.dataset.type === "coupon";
      document.getElementById("rewardCashPanel").style.display = isCoupon ? "none" : "block";
      document.getElementById("rewardCouponPanel").style.display = isCoupon ? "block" : "none";

      if (isCoupon) {
        const select = document.getElementById("rewardCouponProduct");
        if (select && select.options.length <= 1) {
          const products = await getProductsCache();
          select.innerHTML = products.length
            ? products.map(p => `<option value="${p.id}">${escapeHtml(p.productName || "Product")} — ₹${p.price ?? ""}</option>`).join("")
            : `<option value="">No products found</option>`;
        }
      }
      return;
    }

    if (e.target.id === "giveCashRewardBtn") {
      await giveCashReward(e.target);
      return;
    }

    if (e.target.id === "giveCouponRewardBtn") {
      await giveCouponReward(e.target);
      return;
    }

  });
}

async function giveCashReward(btn) {

  const input = document.getElementById("rewardCashAmount");
  const amount = Number(input.value);

  if (!amount || amount < 1 || amount > 200) {
    showToast("Enter an amount between ₹1 and ₹200", "danger");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Saving...";

  try {

    const orderId = currentDetailsOrderId;

    await updateDoc(doc(db, "orders", orderId), {
      cashbackAmount: amount,
      cashbackStatus: "pending"
    });

    const orderSnap = await getDoc(doc(db, "orders", orderId));
    const order = orderSnap.data();

    // Same "pending" aggregate the wallet page reads, credited for
    // real once this order is marked Delivered.
    await updateDoc(doc(db, "users", order.userId), {
      pendingCashbackBalance: increment(amount)
    });

    await logAdminAction("Gave cash reward", "Orders", { orderId, userId: order.userId, amount });

    const idx = allOrders.findIndex(o => o.id === orderId);
    if (idx !== -1) allOrders[idx] = { ...allOrders[idx], cashbackAmount: amount, cashbackStatus: "pending" };

    renderOrderDetails({ ...order, cashbackAmount: amount, cashbackStatus: "pending" });
    showToast("Cash reward given — customer sees it on their Cashback page", "success");

  } catch (error) {
    console.error(error);
    showToast(error.message || "Couldn't give reward.", "danger");
    btn.disabled = false;
    btn.textContent = "Give Cash Reward";
  }

}

async function giveCouponReward(btn) {

  const productSelect = document.getElementById("rewardCouponProduct");
  const discountInput = document.getElementById("rewardCouponDiscount");

  const productId = productSelect.value;
  const discount = Number(discountInput.value);

  if (!productId) {
    showToast("Choose a product first", "danger");
    return;
  }
  if (!discount || discount < 1) {
    showToast("Enter a valid discount amount", "danger");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Saving...";

  try {

    const orderId = currentDetailsOrderId;
    const orderSnap = await getDoc(doc(db, "orders", orderId));
    const order = orderSnap.data();

    const products = await getProductsCache();
    const product = products.find(p => p.id === productId);
    const code = generateCouponCode();

    await setDoc(doc(db, "coupons", code), {
      code,
      userId: order.userId,
      productId,
      productName: product?.productName || "Product",
      discountAmount: discount,
      used: false,
      givenForOrderId: orderId,
      createdAt: new Date()
    });

    await updateDoc(doc(db, "orders", orderId), {
      couponGivenCode: code,
      couponGivenProductId: productId,
      couponGivenProductName: product?.productName || "Product",
      couponGivenDiscount: discount,
      couponGivenUsed: false
    });

    await logAdminAction("Gave coupon reward", "Orders", { orderId, userId: order.userId, code, productId, discount });

    renderOrderDetails({
      ...order,
      couponGivenCode: code,
      couponGivenProductName: product?.productName || "Product",
      couponGivenDiscount: discount,
      couponGivenUsed: false
    });

    showToast("Coupon given — applies automatically at their next checkout", "success");

  } catch (error) {
    console.error(error);
    showToast(error.message || "Couldn't give coupon.", "danger");
    btn.disabled = false;
    btn.textContent = "Give Coupon Reward";
  }

}


/* =========================
   BULK SELECT + SHIPPING LABELS
========================= */

const bulkBar = document.getElementById("bulkBar");
const bulkCount = document.getElementById("bulkCount");
const bulkLabelsBtn = document.getElementById("bulkLabelsBtn");
const bulkClearBtn = document.getElementById("bulkClearBtn");

function updateBulkBar() {
  if (!bulkBar) return;
  if (selectedOrderIds.size > 0) {
    bulkBar.style.display = "flex";
    bulkCount.textContent = `${selectedOrderIds.size} order${selectedOrderIds.size === 1 ? "" : "s"} selected`;
  } else {
    bulkBar.style.display = "none";
  }
}

if (ordersList) {
  ordersList.addEventListener("change", (e) => {
    const checkbox = e.target.closest(".order-select-checkbox");
    if (!checkbox) return;

    if (checkbox.checked) {
      selectedOrderIds.add(checkbox.dataset.id);
    } else {
      selectedOrderIds.delete(checkbox.dataset.id);
    }

    updateBulkBar();
  });
}

if (bulkClearBtn) {
  bulkClearBtn.addEventListener("click", () => {
    selectedOrderIds.clear();
    renderOrderList();
  });
}

function labelHTML(order) {

  const itemsHTML = (order.products || []).map(p =>
    `<div>${escapeHtml(p.productName || "")}${p.qty > 1 ? ` × ${p.qty}` : ""} — ${escapeHtml(p.productCode || "")}</div>`
  ).join("");

  return `
    <div class="ship-label">
      <div class="ship-label-header">
        <div><b>Bestify Mobile</b><br>Kolavi</div>
        <div style="text-align:right;">Order #${escapeHtml(String(order.orderNumber || order.id.slice(0, 8).toUpperCase()))}<br>${formatDate(order.createdAt)}</div>
      </div>
      <hr>
      <div class="ship-label-to">
        <b>DELIVER TO:</b><br>
        <b>${escapeHtml(order.customerName || "Customer")}</b><br>
        ${escapeHtml(order.address || "")}<br>
        📞 ${escapeHtml(order.mobile || "")}
      </div>
      <hr>
      <div class="ship-label-items">
        ${itemsHTML}
      </div>
      <hr>
      <div class="ship-label-footer">
        <div>Payment: ${order.paymentMethod === "cod" ? "COD — ₹" + (order.total || 0) : "PREPAID"}</div>
      </div>
    </div>
  `;

}

if (bulkLabelsBtn) {
  bulkLabelsBtn.addEventListener("click", () => {

    const selectedOrders = allOrders.filter(o => selectedOrderIds.has(o.id));
    if (!selectedOrders.length) return;

    const labelsHTML = selectedOrders.map(labelHTML).join("");

    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Shipping Labels</title>
        <style>
          body{ font-family: Arial, sans-serif; margin:0; padding:0; }
          .ship-label{
            width: 4in; min-height: 5in;
            padding: 16px; box-sizing: border-box;
            page-break-after: always;
            font-size: 13px;
          }
          .ship-label-header{ display:flex; justify-content:space-between; font-size:12px; }
          .ship-label-to{ margin:10px 0; line-height:1.5; }
          .ship-label-items{ font-size:12px; margin:10px 0; }
          hr{ border:none; border-top:1px dashed #999; margin:8px 0; }
          @media print{ .ship-label{ page-break-after: always; } }
        </style>
      </head>
      <body onload="window.print()">
        ${labelsHTML}
      </body>
      </html>
    `);
    printWindow.document.close();

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

  loadOrders();

});
