import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

let currentUser = null;
let cartData = []; // [{id, productName, price, mrp, image, category, description, qty, ...}]

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[m]);
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  currentUser = user;
  loadCart();
});

async function loadCart() {

  document.getElementById("loading-state").classList.remove("hidden");
  document.getElementById("cart-list").classList.add("hidden");

  try {
    const snap = await getDocs(collection(db, "users", currentUser.uid, "cart"));
    cartData = snap.docs.map(d => ({ id: d.id, ...d.data(), qty: d.data().qty || 1 }));
  } catch (error) {
    console.error(error);
    document.getElementById("loading-state").textContent = "❌ Couldn't load your cart. Please refresh.";
    return;
  }

  document.getElementById("loading-state").classList.add("hidden");
  document.getElementById("cart-list").classList.remove("hidden");

  renderCart();

}

function renderCart() {

  const container = document.getElementById("cart-list");
  container.innerHTML = "";

  if (cartData.length === 0) {
    document.getElementById("empty-cart").classList.remove("hidden");
    document.getElementById("price-section").classList.add("hidden");
    document.getElementById("bottom-checkout").classList.add("hidden");
    document.getElementById("cart-list").classList.add("hidden");
    updateTotals();
    return;
  }

  document.getElementById("empty-cart").classList.add("hidden");
  document.getElementById("price-section").classList.remove("hidden");
  document.getElementById("bottom-checkout").classList.remove("hidden");

  cartData.forEach(item => {

    const price = Number(item.price) || 0;
    const mrp = Number(item.mrp) || 0;
    const hasDiscount = mrp > price;
    const discount = hasDiscount ? (mrp - price) : 0;

    const card = document.createElement("div");
    card.className = "order-card";

    card.innerHTML = `
      <div class="flex items-start justify-between gap-3 cursor-pointer" data-open-modal="${escapeHtml(item.id)}">

        <div class="w-20 h-20 bg-amber-50 rounded-xl p-1 border border-slate-200/60 shrink-0 flex items-center justify-center">
          <img src="${escapeHtml(item.image || "")}" alt="${escapeHtml(item.productName)}" class="max-h-full max-w-full object-contain rounded">
        </div>

        <div class="flex-1 space-y-0.5">
          <h3 class="text-sm font-bold text-emerald-700 leading-tight">${escapeHtml(item.productName)}</h3>
          <p class="text-xs font-semibold text-slate-600">${escapeHtml(item.category || "")}</p>
          <p class="text-xs text-slate-400 font-medium">
            ${item.selectedColour ? `Color: ${escapeHtml(item.selectedColour)}<span class="mx-1">•</span>` : ""}Qty: ${item.qty}
          </p>
          <p class="text-sm font-black text-slate-800 mt-1">₹${price}</p>
        </div>

        <div class="text-slate-500 text-lg pr-1"><i class="fa-solid fa-chevron-right text-sm"></i></div>

      </div>

      <div class="mt-3 bg-emerald-50/70 border border-emerald-100/80 rounded-xl p-2.5">

        <div class="flex items-center justify-between gap-2">
          <div>
            ${hasDiscount ? `<p class="text-xs text-slate-500 line-through font-medium">₹${mrp}</p>` : ""}
            <div class="flex items-center gap-2 mt-0.5 flex-wrap">
              <span class="text-sm font-extrabold text-slate-800">₹${price}</span>
              ${hasDiscount ? `
                <span class="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">Save ₹${discount}</span>
              ` : ""}
            </div>
          </div>

          <button data-pay-single="${escapeHtml(item.id)}" data-qty="${item.qty}" class="btn-pay-now-list shadow-xs shrink-0">Pay Now</button>
        </div>

        <div class="flex items-center justify-between mt-3 pt-2 border-t border-emerald-100">

          <div class="flex items-center gap-2">
            <span class="text-[10px] font-bold text-slate-400">Quantity</span>
            <div class="flex items-center gap-1">
              <button data-qty-decrease="${escapeHtml(item.id)}" class="qty-btn">−</button>
              <span class="w-7 text-center text-xs font-black">${item.qty}</span>
              <button data-qty-increase="${escapeHtml(item.id)}" class="qty-btn" ${typeof item.stock === "number" && item.qty >= item.stock ? "disabled" : ""}>+</button>
            </div>
          </div>

          <button data-remove="${escapeHtml(item.id)}" class="remove-btn"><i class="fa-solid fa-trash mr-1"></i>Remove</button>

        </div>

      </div>
    `;

    container.appendChild(card);

  });

  updateTotals();

}

document.getElementById("cart-list").addEventListener("click", async (e) => {

  const decBtn = e.target.closest("[data-qty-decrease]");
  const incBtn = e.target.closest("[data-qty-increase]");
  const removeBtn = e.target.closest("[data-remove]");
  const payBtn = e.target.closest("[data-pay-single]");
  const openBtn = e.target.closest("[data-open-modal]");

  if (decBtn) {
    e.stopPropagation();
    await changeQty(decBtn.dataset.qtyDecrease, -1);
    return;
  }

  if (incBtn) {
    e.stopPropagation();
    await changeQty(incBtn.dataset.qtyIncrease, 1);
    return;
  }

  if (removeBtn) {
    e.stopPropagation();
    await removeFromCart(removeBtn.dataset.remove);
    return;
  }

  if (payBtn) {
    e.stopPropagation();
    paySingleProduct(payBtn.dataset.paySingle);
    return;
  }

  if (openBtn) {
    openModal(openBtn.dataset.openModal);
  }

});

async function changeQty(id, delta) {

  const item = cartData.find(p => p.id === id);
  if (!item) return;

  const newQty = item.qty + delta;

  if (newQty < 1) {
    if (confirm("Remove this product from cart?")) {
      await removeFromCart(id);
    }
    return;
  }

  item.qty = newQty;
  renderCart();

  try {
    await setDoc(doc(db, "users", currentUser.uid, "cart", id), { ...item, qty: newQty });
  } catch (error) {
    console.error(error);
    alert(error.message || "Could not update quantity.");
  }

}

async function removeFromCart(id) {

  cartData = cartData.filter(p => p.id !== id);
  renderCart();

  try {
    await deleteDoc(doc(db, "users", currentUser.uid, "cart", id));
  } catch (error) {
    console.error(error);
    alert(error.message || "Could not remove item. Please refresh.");
    loadCart();
  }

}

function updateTotals() {

  let productTotal = 0;
  let discountTotal = 0;
  let itemCount = 0;
  let grandTotal = 0;

  cartData.forEach(item => {
    const price = Number(item.price) || 0;
    const mrp = Number(item.mrp) || 0;
    const qty = item.qty || 1;

    productTotal += (mrp > price ? mrp : price) * qty;
    discountTotal += (mrp > price ? (mrp - price) : 0) * qty;
    grandTotal += price * qty;
    itemCount += qty;
  });

  document.getElementById("product-total").innerText = `₹${productTotal.toLocaleString("en-IN")}`;
  document.getElementById("discount-total").innerText = `- ₹${discountTotal.toLocaleString("en-IN")}`;
  document.getElementById("grand-total").innerText = `₹${grandTotal.toLocaleString("en-IN")}`;
  document.getElementById("bottom-total").innerText = `₹${grandTotal.toLocaleString("en-IN")}`;
  document.getElementById("cart-count").innerText = itemCount;
  document.getElementById("item-count").innerText = itemCount;

}


/* ---------------- Product Details Modal ---------------- */

function openModal(id) {

  const item = cartData.find(p => p.id === id);
  if (!item) return;

  const price = Number(item.price) || 0;
  const mrp = Number(item.mrp) || 0;
  const hasDiscount = mrp > price;

  document.getElementById("modal-img").src = item.image || "";

  const discountBadge = document.getElementById("modal-discount");
  if (hasDiscount) {
    discountBadge.textContent = `${Math.round(((mrp - price) / mrp) * 100)}% OFF`;
    discountBadge.classList.remove("hidden");
  } else {
    discountBadge.classList.add("hidden");
  }

  document.getElementById("modal-category").textContent = item.category || "";
  document.getElementById("modal-title").textContent = item.productName || "";
  document.getElementById("modal-price").textContent = `₹${price}`;

  const mrpEl = document.getElementById("modal-mrp");
  const savingsEl = document.getElementById("modal-savings-tag");
  if (hasDiscount) {
    mrpEl.textContent = `₹${mrp}`;
    savingsEl.textContent = `ಉಳಿತಾಯ: ₹${mrp - price}`;
    savingsEl.classList.remove("hidden");
  } else {
    mrpEl.textContent = "";
    savingsEl.classList.add("hidden");
  }

  document.getElementById("modal-desc").textContent = item.description || "";

  const payBtn = document.getElementById("modal-arrow-pay-btn");
  payBtn.innerHTML = `⚡ ₹${price * item.qty} Pay Now`;
  payBtn.onclick = function () {
    closeModal();
    paySingleProduct(item.id);
  };

  document.getElementById("order-modal").classList.remove("hidden");
  document.body.style.overflow = "hidden";

}

window.closeModal = function () {
  document.getElementById("order-modal").classList.add("hidden");
  document.body.style.overflow = "";
};


/* ---------------- Checkout routing (real) ---------------- */

function paySingleProduct(id) {
  const item = cartData.find(p => p.id === id);
  if (!item) return;
  window.location.href = `checkout.html?productId=${id}&qty=${item.qty}`;
}

window.placeOrder = function () {
  if (cartData.length === 0) {
    alert("Your cart is empty.");
    return;
  }
  window.location.href = "checkout.html";
};

window.continueShopping = function () {
  window.location.href = "home.html";
};


document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") window.closeModal();
});
