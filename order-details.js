import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { raiseAdminAlert } from "./admin-alerts.js";
import { normalizeOrder, isV2Order } from "./order-compat.js";

const orderContent = document.getElementById("orderContent");

const params = new URLSearchParams(window.location.search);
const orderId = params.get("orderId");

const STEPS = ["Ordered", "Packed", "Shipped", "Delivered"];

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[m]);
}

function toDate(ts) {
  try {
    return ts?.toDate ? ts.toDate() : new Date(ts);
  } catch {
    return null;
  }
}

function formatDateTime(ts) {
  const d = toDate(ts);
  if (!d || isNaN(d.getTime())) return "Not available";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
    ", " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function formatDateLong(d) {
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
}

// Real estimate — order date + 4 days, matching the "2-4 business days"
// estimate used at checkout elsewhere on the site. Not a live courier
// ETA (this shop doesn't have one), just an honest ballpark.
function estimatedDeliveryDate(order) {
  const created = toDate(order.createdAt);
  if (!created || isNaN(created.getTime())) return null;
  const est = new Date(created);
  est.setDate(est.getDate() + 4);
  return est;
}

function stepIndexFor(status) {
  switch (status) {
    case "Pending":
    case "Confirmed":
      return 0;
    case "Packed":
      return 1;
    case "Shipped":
      return 2;
    case "Delivered":
      return 3;
    default:
      return 0;
  }
}

let currentOrder = null;
let currentUser = null;

onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  if (!orderId) {
    orderContent.innerHTML = `<div class="card no-results"><h2>No order specified</h2></div>`;
    return;
  }

  await loadOrder();

});

async function loadOrder() {

  orderContent.innerHTML = `<div class="card" style="text-align:center;color:#777;">Loading order…</div>`;

  try {

    const snap = await getDoc(doc(db, "orders", orderId));

    if (!snap.exists()) {
      orderContent.innerHTML = `<div class="card no-results"><h2>Order not found</h2></div>`;
      return;
    }

    const order = normalizeOrder({ id: snap.id, ...snap.data() });

    if (order.userId !== currentUser.uid) {
      orderContent.innerHTML = `<div class="card no-results"><h2>You don't have access to this order</h2></div>`;
      return;
    }

    currentOrder = order;
    render(order);

  } catch (error) {
    console.error(error);
    orderContent.innerHTML = `
      <div class="card no-results">
        <h2>❌ Couldn't load this order</h2>
        <p>${escapeHtml(error.message || "Please try again.")}</p>
        <button type="button" class="cancel-btn" id="retryOrderBtn" style="margin-top:12px;">Retry</button>
      </div>`;
    document.getElementById("retryOrderBtn")?.addEventListener("click", loadOrder);
  }

}

function render(order) {

  const products = Array.isArray(order.products) ? order.products : [];
  const firstProduct = products[0] || {};
  const total = order.total ?? order.totalPrice ?? 0;
  const isCancelled = order.status === "Cancelled";
  const isDelivered = order.status === "Delivered";
  // See orders.js — v2 orders are cancelled through support for now.
  const isEarlyStage = ["Pending", "Confirmed", "Packed"].includes(order.status);
  const canCancel = isEarlyStage && !isV2Order(order);
  const cancelViaSupport = isEarlyStage && isV2Order(order);
  const isCOD = order.paymentMethod === "cod";

  const activeIndex = stepIndexFor(order.status);
  const progressPct = isCancelled ? 0 : (activeIndex / (STEPS.length - 1)) * 100;

  const estDate = estimatedDeliveryDate(order);

  orderContent.innerHTML = `

    <div class="card product-card">
      <img class="product-img" src="${escapeHtml(firstProduct.image || "")}" alt="${escapeHtml(firstProduct.productName || "")}">
      <div class="product-info">
        <div class="product-title">${escapeHtml(firstProduct.productName || "Product")}${products.length > 1 ? ` +${products.length - 1} more` : ""}</div>
        <div class="product-meta">Qty: ${firstProduct.qty || 1}</div>
        <div class="product-price">₹${total}</div>
      </div>
      <button type="button" class="share-btn" id="shareOrderBtn">🔗 Share</button>
    </div>

    <div class="card">

      ${isCancelled ? `
        <div class="delivery-estimate cancelled">
          <span class="truck-icon">❌</span>
          <div>
            <div class="est-title">Order Cancelled</div>
            <div class="est-date">${order.cancelledAt ? formatDateTime(order.cancelledAt) : ""}</div>
          </div>
        </div>
      ` : isDelivered ? `
        <div class="delivery-estimate">
          <span class="truck-icon">✅</span>
          <div>
            <div class="est-title">Delivered</div>
            <div class="est-date">${estDate ? formatDateLong(estDate) : ""}</div>
          </div>
        </div>
      ` : estDate ? `
        <div class="delivery-estimate">
          <span class="truck-icon">🚚</span>
          <div>
            <div class="est-title">Estimated Delivery</div>
            <div class="est-date">By ${formatDateLong(estDate)}</div>
          </div>
        </div>
      ` : ""}

      <div class="tracker-header">
        <div class="status-title">${isCancelled ? "Cancelled" : STEPS[activeIndex]}</div>
        <div class="order-date">Placed on ${formatDateTime(order.createdAt)}</div>
      </div>

      ${isCancelled ? `
        <div class="cancelled-note">This order was cancelled and will not be delivered.</div>
      ` : `
        <div class="steps" style="--progress:${progressPct}%;">
          ${STEPS.map((label, i) => `
            <div class="step ${i <= activeIndex ? "active" : ""}">
              <div class="step-icon">${i < activeIndex ? "✓" : i + 1}</div>
              <div>${label}</div>
            </div>
          `).join("")}
        </div>

        ${canCancel ? `<button type="button" class="cancel-btn" id="cancelOrderBtn">Cancel Order</button>` : ""}
        ${cancelViaSupport ? `<a class="cancel-btn" href="chat.html" style="display:block;text-align:center;text-decoration:none;">💬 Need to cancel? Chat with us</a>` : ""}
      `}

    </div>

    <div class="card">
      <div class="section-title">Delivery Address</div>
      <div class="address-name">${escapeHtml(order.customerName || "Customer")}</div>
      <div class="address-text">${escapeHtml(order.address || "Not available")}</div>
      <div class="address-text">📱 ${escapeHtml(order.mobile || "")}</div>
    </div>

    <div class="card">
      <div class="section-title">Payment &amp; Bill Details</div>
      <div class="price-row">
        <span>Item Price</span>
        <span>₹${total}</span>
      </div>
      <div class="price-row">
        <span>Delivery Fee</span>
        <span style="color:#2e7d32;">FREE</span>
      </div>
      <div class="price-row">
        <span>Payment Mode</span>
        <span class="${isCOD ? "badge-cod" : "badge-paid"}">${isCOD ? "Cash on Delivery" : "Paid Online"}</span>
      </div>
      <div class="price-row total">
        <span>Total Amount</span>
        <span>₹${total}</span>
      </div>
    </div>

  `;

  document.getElementById("shareOrderBtn").addEventListener("click", async () => {
    const shareUrl = firstProduct.id
      ? new URL(`product.html?id=${firstProduct.id}`, window.location.href).href
      : window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Bestify", text: `I just ordered ${firstProduct.productName} from Bestify!`, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        alert("Link copied!");
      }
    } catch (error) {
      // cancelled — nothing to do
    }
  });

  const cancelBtn = document.getElementById("cancelOrderBtn");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", async () => {

      if (!confirm("Cancel this order?")) return;

      cancelBtn.disabled = true;
      cancelBtn.textContent = "Cancelling...";

      try {

        await updateDoc(doc(db, "orders", order.id), {
          status: "Cancelled",
          cancelledAt: new Date()
        });

        raiseAdminAlert("order_cancel", `Order cancelled by customer`, {
          userId: currentUser.uid,
          orderId: order.id
        });

        await loadOrder();

      } catch (error) {
        console.error(error);
        alert(error.message || "Could not cancel this order.");
        cancelBtn.disabled = false;
        cancelBtn.textContent = "Cancel Order";
      }

    });
  }

}
