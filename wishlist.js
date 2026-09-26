import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const wishlistDiv = document.getElementById("wishlistItems");

let wishlistItems = [];
let currentUser = null;

onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  try {

    const querySnapshot = await getDocs(
      collection(db, "users", user.uid, "wishlist")
    );

    wishlistItems = querySnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    render();

  } catch (error) {

    alert(error.message);
    console.log(error);

  }

});

function render() {

  if (wishlistItems.length === 0) {
    wishlistDiv.innerHTML = `
      <div class="wl-empty">
        <div class="wl-empty-icon">❤️</div>
        <h2>You haven't liked anything yet</h2>
        <p>Tap the heart on any product to save it here.</p>
        <a href="home.html" class="wl-empty-btn">Browse Products</a>
      </div>
    `;
    return;
  }

  wishlistDiv.innerHTML = wishlistItems.map((product) => `
    <article class="wl-card" data-id="${product.id}">
      <div class="wl-image-wrapper">
        <img src="${product.image}" alt="${product.productName}">
      </div>
      <div class="wl-card-details">
        <div>
          <h2 class="wl-product-title">${product.productName}</h2>
          <div class="wl-price-tag">₹${product.price}</div>
        </div>
        <div class="wl-actions">
          <button type="button" class="wl-btn wl-btn-buy" data-id="${product.id}">
            <i class="fa-solid fa-bolt"></i> Buy Now
          </button>
        </div>
        <div class="wl-actions">
          <button type="button" class="wl-btn wl-btn-move" data-id="${product.id}">
            <i class="fa-solid fa-cart-shopping"></i> Move to Cart
          </button>
          <button type="button" class="wl-btn wl-btn-remove" data-id="${product.id}">
            Remove <i class="fa-solid fa-heart"></i>
          </button>
        </div>
      </div>
    </article>
  `).join("");

}

wishlistDiv.addEventListener("click", async (e) => {

  if (!currentUser) return;

  const removeBtn = e.target.closest(".wl-btn-remove");
  if (removeBtn) {

    const id = removeBtn.dataset.id;

    try {
      await deleteDoc(doc(db, "users", currentUser.uid, "wishlist", id));
      wishlistItems = wishlistItems.filter((i) => i.id !== id);
      render();
    } catch (error) {
      alert(error.message);
      console.log(error);
    }

    return;
  }

  const buyBtn = e.target.closest(".wl-btn-buy");
  if (buyBtn) {
    window.location.href = `checkout.html?productId=${buyBtn.dataset.id}`;
    return;
  }

  const moveBtn = e.target.closest(".wl-btn-move");
  if (moveBtn) {

    const id = moveBtn.dataset.id;

    try {

      const productSnap = await getDoc(doc(db, "products", id));

      if (!productSnap.exists()) {
        alert("Product Not Found");
        return;
      }

      const cartRef = doc(db, "users", currentUser.uid, "cart", id);
      const cartSnap = await getDoc(cartRef);
      const qty = cartSnap.exists() ? (cartSnap.data().qty || 1) + 1 : 1;

      await setDoc(cartRef, { ...productSnap.data(), qty });
      await deleteDoc(doc(db, "users", currentUser.uid, "wishlist", id));

      wishlistItems = wishlistItems.filter((i) => i.id !== id);
      render();

      alert("Moved to Cart 🛒");

    } catch (error) {
      alert(error.message);
      console.log(error);
    }

    return;
  }

  // Tapped the card itself (not a button) — open the full product page.
  const card = e.target.closest(".wl-card");
  if (card) {
    window.location.href = `product.html?id=${card.dataset.id}`;
  }

});

// Kept for backward compatibility (inline onclick no longer used)
window.removeWishlist = async function(id) {

  const user = auth.currentUser;

  if (!user) {
    alert("Please Login First");
    return;
  }

  try {

    await deleteDoc(doc(db, "users", user.uid, "wishlist", id));
    wishlistItems = wishlistItems.filter((i) => i.id !== id);
    render();

  } catch (error) {

    alert(error.message);

  }

};
