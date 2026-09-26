import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const rewardsList = document.getElementById("rewardsList");

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
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

function rewardCardHTML(order) {

  const orderLabel = "#" + (order.orderNumber || order.id.slice(0, 8).toUpperCase());
  const cards = [];

  if (order.cashbackAmount > 0) {

    const credited = order.cashbackStatus === "credited";

    cards.push(`
      <div class="reward-card">
        <div class="reward-card-top">
          <div>
            <div class="reward-order-label">Order ${escapeHtml(orderLabel)} · ${formatDate(order.createdAt)}</div>
          </div>
          <span class="reward-pill ${credited ? "credited" : "pending"}">${credited ? "✓ Credited" : "⏳ Pending"}</span>
        </div>
        <div class="reward-body">
          <div class="reward-icon cash"><i class="fa-solid fa-indian-rupee-sign"></i></div>
          <div>
            <div class="reward-title">₹${order.cashbackAmount} Cash Reward</div>
            <div class="reward-sub">${credited ? "Added to your wallet balance." : "Will be added to your wallet once this order is delivered."}</div>
          </div>
        </div>
      </div>
    `);

  }

  if (order.couponGivenCode) {

    const used = !!order.couponGivenUsed;

    cards.push(`
      <div class="reward-card">
        <div class="reward-card-top">
          <div>
            <div class="reward-order-label">Order ${escapeHtml(orderLabel)} · ${formatDate(order.createdAt)}</div>
          </div>
          <span class="reward-pill ${used ? "used" : "unused"}">${used ? "Used" : "Ready to use"}</span>
        </div>
        <div class="reward-body">
          <div class="reward-icon coupon"><i class="fa-solid fa-ticket"></i></div>
          <div>
            <div class="reward-title">₹${order.couponGivenDiscount} off "${escapeHtml(order.couponGivenProductName || "a product")}"</div>
            <div class="reward-sub">${used
              ? "Already used on a later order."
              : `Code ${escapeHtml(order.couponGivenCode)} — applies automatically when you buy this product.`}</div>
          </div>
        </div>
      </div>
    `);

  }

  return cards.join("");

}

onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {

    const q = query(collection(db, "orders"), where("userId", "==", user.uid));
    const snap = await getDocs(q);

    let orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    orders = orders.filter(o => o.cashbackAmount > 0 || o.couponGivenCode);

    orders.sort((a, b) => {
      const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
      const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
      return tb - ta;
    });

    if (!orders.length) {
      rewardsList.innerHTML = `
        <div class="reward-empty">
          <div class="icon">🎁</div>
          <div style="font-weight:700; margin-bottom:4px;">No rewards yet</div>
          <div style="font-size:12.5px;">Bestify Mobile sometimes gives cash rewards or coupons on orders — they'll show up here.</div>
        </div>
      `;
      return;
    }

    rewardsList.innerHTML = `<div class="reward-list">${orders.map(rewardCardHTML).join("")}</div>`;

  } catch (error) {
    console.error(error);
    rewardsList.innerHTML = `<div class="reward-empty">Couldn't load your rewards. Please try again.</div>`;
  }

});
