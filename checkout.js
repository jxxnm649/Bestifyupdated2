import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  updateDoc,
  increment,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-functions.js";

import { raiseAdminAlert } from "./admin-alerts.js";
import { nextSequenceNumber } from "./counters.js";

const functions = getFunctions();
const createRazorpayOrder = httpsCallable(functions, "createRazorpayOrder");
const verifyRazorpayPayment = httpsCallable(functions, "verifyRazorpayPayment");
const placeOrder = httpsCallable(functions, "placeOrder");


/* =========================
   Idempotency key for COD.

   Generated once per checkout visit and kept in sessionStorage, so a
   double-tap, a refresh mid-request, or a retry all send the SAME id.
   The server treats a repeat id as "already done" and returns the
   original order instead of creating a second one. Cleared only once
   an order actually succeeds.
========================= */

function getClientRequestId() {
  let id = sessionStorage.getItem("bf_order_request_id");
  if (!id) {
    id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem("bf_order_request_id", id);
  }
  return id;
}

function clearClientRequestId() {
  sessionStorage.removeItem("bf_order_request_id");
}

// Cart rows are the customer's own data, so they're cleared from the
// client. The COD path needs this because the server no longer writes
// the order (and so no longer clears the cart) for COD.
async function clearCartAfterOrder(cartSnapshot) {
  if (!cartSnapshot) return;
  try {
    await Promise.all(
      cartSnapshot.docs.map(d =>
        deleteDoc(doc(db, "users", currentUser.uid, "cart", d.id))
      )
    );
  } catch (error) {
    console.log("Cart clear failed (order is already placed):", error);
  }
}

const form = document.getElementById("checkoutForm");
const summaryEl = document.getElementById("orderSummary");

let currentUser = null;

const params = new URLSearchParams(window.location.search);
const buyNowProductId = params.get("productId");
const buyNowQty = Number(params.get("qty")) || 1;
const buyNowSize = params.get("size");
const buyNowColour = params.get("colour");

onAuthStateChanged(auth, (user) => {

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;
  renderSummary();
  prefillFromProfile(user);

});

// Prefill checkout form with saved profile details (name/mobile/address), still editable
async function prefillFromProfile(user) {
  try {
    const docSnap = await getDoc(doc(db, "users", user.uid));
    if (!docSnap.exists()) return;

    const data = docSnap.data();
    const nameField = document.getElementById("customerName");
    const mobileField = document.getElementById("mobile");
    const addressField = document.getElementById("address");

    const isValidText = (v) => typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "true" && v.trim().toLowerCase() !== "false";

    if (nameField && !nameField.value && isValidText(data.name)) nameField.value = data.name;
    if (mobileField && !mobileField.value && isValidText(data.mobile)) mobileField.value = data.mobile;
    if (addressField && !addressField.value && isValidText(data.address)) addressField.value = data.address;

    // Pincode: last one saved on their profile, else the one they set
    // on the home page's "Delivering to" line.
    const pincodeField = document.getElementById("pincode");
    if (pincodeField && !pincodeField.value) {
      const saved = /^\d{6}$/.test(String(data.pincode || "")) ? data.pincode
        : (localStorage.getItem("bf_delivery_pincode") || "");
      if (/^\d{6}$/.test(saved)) pincodeField.value = saved;
    }

  } catch (error) {
    console.log(error);
  }
}

// Fetch the items that will be ordered (Buy Now product OR full cart)
async function getOrderItems() {

  const products = [];
  let cartSnapshot = null;

  if (buyNowProductId) {

    const productSnap = await getDoc(doc(db, "products", buyNowProductId));

    if (!productSnap.exists()) {
      return { products: [], cartSnapshot: null };
    }

    products.push({
      ...productSnap.data(),
      id: buyNowProductId,
      qty: buyNowQty,
      ...(buyNowSize ? { selectedSize: buyNowSize } : {}),
      ...(buyNowColour ? { selectedColour: buyNowColour } : {})
    });

  } else {

    cartSnapshot = await getDocs(
      collection(db, "users", currentUser.uid, "cart")
    );

    cartSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      products.push({ ...data, id: docSnap.id, qty: data.qty || 1 });
    });

  }

  return { products, cartSnapshot };

}

function calcTotal(products) {
  return products.reduce(
    (sum, item) => sum + Number(item.price) * Number(item.qty || 1),
    0
  );
}

async function renderSummary() {

  const { products } = await getOrderItems();

  if (products.length === 0) {
    summaryEl.innerHTML = `<p class="no-results">Your Cart is Empty 🛒</p>`;
    form.querySelector("button[type=submit]").disabled = true;
    return;
  }

  const total = calcTotal(products);

  const appliedCoupon = await findApplicableCoupon(products);
  const couponDiscount = appliedCoupon ? Math.min(Number(appliedCoupon.discountAmount) || 0, total) : 0;
  const finalTotal = Math.max(0, total - couponDiscount);

  let totalSavings = 0;

  const rowsHtml = products.map(p => {

    const qty = Number(p.qty || 1);
    const price = Number(p.price) || 0;
    const mrp = Number(p.mrp) || 0;
    const hasDiscount = mrp > price;
    const lineTotal = price * qty;

    if (hasDiscount) totalSavings += (mrp - price) * qty;

    const variantText = (p.selectedSize || p.selectedColour)
      ? ` <small style="color:var(--ink-soft,#888);">(${[p.selectedSize, p.selectedColour].filter(Boolean).join(", ")})</small>`
      : "";

    return `
      <div class="summary-row" style="align-items:center;gap:10px;">
        ${p.image ? `<img src="${p.image}" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:8px;flex-shrink:0;">` : ""}
        <span style="flex:1;min-width:0;">
          ${p.productName || "Product"}${qty > 1 ? ` × ${qty}` : ""}${variantText}
          ${hasDiscount ? `<br><span style="font-size:11px;"><span style="text-decoration:line-through;color:#999;">₹${mrp * qty}</span> <span style="color:#16a34a;font-weight:700;">Saved ₹${(mrp - price) * qty}</span></span>` : ""}
        </span>
        <span style="flex-shrink:0;font-weight:600;">₹${lineTotal}</span>
      </div>
    `;
  }).join("");

  summaryEl.innerHTML = `
    ${rowsHtml}
    ${totalSavings > 0 ? `
      <div class="summary-row" style="color:#16a34a;font-weight:600;">
        <span>Total Savings</span>
        <span>− ₹${totalSavings}</span>
      </div>
    ` : ""}
    ${appliedCoupon ? `
      <div class="summary-row" style="color:#16a34a;font-weight:600;">
        <span>🎁 Reward Coupon Applied</span>
        <span>− ₹${couponDiscount}</span>
      </div>
    ` : ""}
    <div class="summary-row summary-total">
      <span>Total</span>
      <span>₹${finalTotal}</span>
    </div>
  `;

}

// Admin-given reward coupons: a fixed-₹ discount, restricted to one
// specific customer and one specific product, auto-applied here the
// moment that product is in their order — no code entry needed.
async function findApplicableCoupon(products) {

  try {

    const q = query(
      collection(db, "coupons"),
      where("userId", "==", currentUser.uid),
      where("used", "==", false)
    );

    const snap = await getDocs(q);

    for (const d of snap.docs) {
      const c = d.data();
      const match = products.find(p => p.id === c.productId);
      if (match) return { id: d.id, ...c };
    }

  } catch (error) {
    console.log(error);
  }

  return null;

}

// Reads the delivery pincode without ever crashing the checkout:
// the #pincode field if the page has one, otherwise the first 6-digit
// number found in the address text (older page layouts put it there).
function readPincode(addressText) {
  const field = document.getElementById("pincode");
  const typed = field ? String(field.value || "").trim() : "";
  if (typed) return typed; // what they typed is validated by the caller
  const match = String(addressText || "").match(/\b\d{6}\b/);
  return match ? match[0] : typed;
}

form.addEventListener("submit", async (e) => {

  e.preventDefault();

  const customerName = document.getElementById("customerName").value;
  const mobile = document.getElementById("mobile").value;
  const address = document.getElementById("address").value;
  const deliveryMethod = document.querySelector('input[name="deliveryMethod"]:checked')?.value || "home";
  const pincode = deliveryMethod === "pickup" ? "" : readPincode(address);
  const paymentMethod = document.querySelector(
    'input[name="paymentMethod"]:checked'
  ).value;

  if (deliveryMethod !== "pickup" && !/^\d{6}$/.test(pincode)) {
    alert("Please enter a valid 6-digit pincode.");
    const pincodeInput = document.getElementById("pincode") || document.getElementById("address");
    if (pincodeInput) pincodeInput.focus();
    return;
  }

  if (pincode) localStorage.setItem("bf_delivery_pincode", pincode);

  const placeOrderBtn = document.getElementById("placeOrderBtn");

  try {

    const { products, cartSnapshot } = await getOrderItems();

    if (products.length === 0) {
      alert(buyNowProductId ? "Product Not Found" : "Your Cart is Empty");
      return;
    }

    // Real reward coupon (admin-given, restricted to this customer +
    // this exact product) — applied automatically if they have one
    // for something in this order.
    const appliedCoupon = await findApplicableCoupon(products);

    const rawTotal = calcTotal(products);
    const couponDiscount = appliedCoupon ? Math.min(Number(appliedCoupon.discountAmount) || 0, rawTotal) : 0;
    const totalAmount = Math.max(0, rawTotal - couponDiscount);

    // Unique vendor ids among the ordered items — lets suppliers query
    // "orders that include my products" via array-contains.
    const vendorIds = [...new Set(products.map(p => p.vendorId).filter(Boolean))];

    async function saveOrderAndFinish(extra = {}) {

      const orderNumber = await nextSequenceNumber("orders");

      const orderRef = await addDoc(collection(db, "orders"), {

        userId: currentUser.uid,
        customerName,
        mobile,
        address,
        pincode,
        products,
        vendorIds,
        orderNumber,
        total: totalAmount,
        paymentMethod,
        status: "Pending",
        createdAt: new Date(),
        // Reward — admin gives this manually per order after checkout,
        // not auto-computed here. Starts empty.
        cashbackAmount: 0,
        cashbackStatus: "none",
        ...(appliedCoupon ? {
          couponCode: appliedCoupon.code,
          couponDiscount,
          couponProductId: appliedCoupon.productId
        } : {}),
        ...extra

      });

      // Coupon is single-use — mark it spent now that the order is real.
      if (appliedCoupon) {
        try {
          await updateDoc(doc(db, "coupons", appliedCoupon.id), {
            used: true,
            usedOrderId: orderRef.id,
            usedAt: new Date()
          });
        } catch (error) {
          console.log(error);
        }
      }

      raiseAdminAlert("order", `New order placed by ${customerName || "a customer"} — ₹${totalAmount}`, {
        userId: currentUser.uid,
        orderId: orderRef.id
      });

      if (!buyNowProductId && cartSnapshot) {

        for (const cartDoc of cartSnapshot.docs) {
          await deleteDoc(
            doc(db, "users", currentUser.uid, "cart", cartDoc.id)
          );
        }

      }

      window.location.href = `payment-success.html?orderId=${orderRef.id}&method=${paymentMethod}`;

    }

    // ---------- Cash on Delivery ----------
    // The order is NOT written from here any more. placeOrder (Cloud
    // Function) re-reads every product server-side, checks and reduces
    // stock in a transaction, and creates the Master Order, the vendor
    // Sub-orders and the Commission records. clientRequestId makes the
    // call idempotent, so a double-tap or refresh can't place twice.
    if (paymentMethod === "cod") {

      placeOrderBtn.disabled = true;
      placeOrderBtn.textContent = "Placing Order...";

      try {

        const { data } = await placeOrder({
          clientRequestId: getClientRequestId(),
          items: products.map(p => ({
            id: p.id,
            qty: p.qty || 1,
            ...(p.selectedSize ? { selectedSize: p.selectedSize } : {}),
            ...(p.selectedColour ? { selectedColour: p.selectedColour } : {})
          })),
          customer: {
            name: customerName,
            mobile,
            address,
            pincode,
            deliveryMethod
          },
          // Only the coupon's id is sent — the server re-reads it,
          // checks it belongs to this customer and is unused, works
          // out the discount itself and marks it used.
          ...(appliedCoupon ? { couponId: appliedCoupon.id } : {})
        });

        await clearCartAfterOrder(cartSnapshot);
        clearClientRequestId();

        window.location.href = `payment-success.html?orderId=${data.orderId}&method=cod`;

      } catch (error) {
        console.error("Place order error:", error);
        alert(error.message || "Could not place your order. Please try again.");
        placeOrderBtn.disabled = false;
        placeOrderBtn.textContent = "Place Order";
      }

      return;

    }

    // ---------- Online Payment (Razorpay) ----------
    // The order is created server-side (createRazorpayOrder) so the
    // amount can't be tampered with client-side, and it's only written
    // to Firestore after verifyRazorpayPayment confirms the payment
    // signature on the server — see functions/index.js.

    placeOrderBtn.disabled = true;
    placeOrderBtn.textContent = "Starting Payment...";

    let rzpOrder;

    try {
      const { data } = await createRazorpayOrder({ amount: totalAmount });
      rzpOrder = data;
    } catch (error) {
      console.log(error);
      alert("Could not start payment. Please try again.");
      placeOrderBtn.disabled = false;
      placeOrderBtn.textContent = "Place Order";
      return;
    }

    placeOrderBtn.textContent = "Place Order";
    placeOrderBtn.disabled = false;

    const options = {

      key: rzpOrder.keyId,
      order_id: rzpOrder.orderId,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,

      name: "Bestify Store",

      description: "Product Purchase",

      handler: async function (response) {

        try {

          const { data } = await verifyRazorpayPayment({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            orderData: {
              customerName,
              mobile,
              address,
              pincode,
              deliveryMethod,
              products,
              ...(appliedCoupon ? { couponId: appliedCoupon.id } : {}),
              cartItemIds: (!buyNowProductId && cartSnapshot)
                ? cartSnapshot.docs.map(d => d.id)
                : []
            }
          });

          window.location.href = `payment-success.html?orderId=${data.orderId}&method=online`;

        } catch (error) {
          console.log(error);
          window.location.href = "payment-failed.html";
        }

      },

      modal: {
        ondismiss: function () {
          window.location.href = "payment-failed.html";
        }
      },

      theme: {
        color: "#14213D"
      }

    };

    const rzp = new Razorpay(options);

    rzp.on("payment.failed", function () {
      window.location.href = "payment-failed.html";
    });

    rzp.open();

  } catch (error) {

    console.log(error);
    alert(error.message);

  }

});
