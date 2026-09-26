import { db } from "./firebase.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
const params = new URLSearchParams(window.location.search);
const orderId = params.get("id");

const orderIdEl = document.getElementById("orderId");
const customerEl = document.getElementById("customer");
const mobileEl = document.getElementById("mobile");
const addressEl = document.getElementById("address");
const productsEl = document.getElementById("products");
const totalEl = document.getElementById("total");

loadInvoice();

async function loadInvoice() {

  try {

    const orderRef = doc(db, "orders", orderId);
    const orderSnap = await getDoc(orderRef);

    if (!orderSnap.exists()) {

      document.body.innerHTML = "<h2>Invoice Not Found</h2>";
      return;

    }

    const order = orderSnap.data();

    orderIdEl.innerText = order.orderNumber ? `#${order.orderNumber}` : orderId;
    customerEl.innerText = order.customerName;
    mobileEl.innerText = order.mobile;
    addressEl.innerText = order.address;
    // Works for both legacy orders and server-created (v2) orders.
    // Older v2 orders may have no products array — never crash on it.
    const products = Array.isArray(order.products) ? order.products : [];

    const itemsSum = products.reduce(
      (sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 1),
      0
    );

    // The stored order total is the real amount (it includes any coupon
    // discount); fall back to the line-item sum for old orders without it.
    const storedTotal = Number(order.total);
    const total = Number.isFinite(storedTotal) && order.total !== undefined && order.total !== null
      ? storedTotal
      : itemsSum;

    totalEl.innerText = total;

    const escapeHtml = (str) => String(str ?? "").replace(/[&<>"']/g, m => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[m]);

    productsEl.innerHTML = products.length
      ? products.map((product) => {
          const qty = Number(product.qty) || 1;
          return `
        <div class="product">
          <span>${escapeHtml(product.productName || "Product")}${qty > 1 ? ` × ${qty}` : ""}</span>
          <span>₹${(Number(product.price) || 0) * qty}</span>
        </div>
      `;
        }).join("")
      : `<div class="product"><span>Order items</span><span>₹${total}</span></div>`;

    if (Number(order.couponDiscount) > 0) {
      productsEl.innerHTML += `
        <div class="product">
          <span>Coupon Discount</span>
          <span>− ₹${Number(order.couponDiscount)}</span>
        </div>
      `;
    }

  } catch (error) {

    alert(error.message);
    console.log(error);

  }

}
