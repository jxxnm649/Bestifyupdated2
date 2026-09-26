import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  increment,
  collection,
  getDocs,
  query,
  where,
  limit
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const productMain = document.getElementById("productMain");
const cartBadge = document.getElementById("cartBadge");

const params = new URLSearchParams(window.location.search);
const productId = params.get("id");

let currentUser = null;
let product = null;
let userHasLiked = false;

let currentImages = [];   // the gallery currently shown (product images, or a colour's own image)
let allColorOptions = []; // [{name, images}] — base product photos + real colour variants, in swatch order
let currentImageIndex = 0;

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[m]);
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  updateCartBadge();
  if (product) checkLikedStatus();
});

async function updateCartBadge() {
  if (!currentUser || !cartBadge) return;
  try {
    const snap = await getDocs(collection(db, "users", currentUser.uid, "cart"));
    if (snap.size > 0) {
      cartBadge.textContent = snap.size;
      cartBadge.style.display = "flex";
    } else {
      cartBadge.style.display = "none";
    }
  } catch (error) {
    console.log(error);
  }
}

async function loadProduct() {

  if (!productId) {
    productMain.innerHTML = `<div class="no-results" style="padding:40px 16px;text-align:center;">Product not specified</div>`;
    return;
  }

  try {

    const snap = await getDoc(doc(db, "products", productId));

    if (!snap.exists()) {
      productMain.innerHTML = `<div class="no-results" style="padding:40px 16px;text-align:center;">Product not found</div>`;
      return;
    }

    product = { id: snap.id, ...snap.data() };
    currentImages = (Array.isArray(product.images) && product.images.length) ? product.images : [product.image].filter(Boolean);
    currentImageIndex = 0;

    render();
    await checkLikedStatus();
    loadRelatedProducts();

  } catch (error) {
    console.error(error);
    productMain.innerHTML = `
      <div class="no-results" style="padding:40px 16px;text-align:center;">
        <p>❌ Couldn't load this product.</p>
        <button type="button" class="btn btn-buy" id="retryBtn" style="margin-top:12px;">Retry</button>
      </div>`;
    document.getElementById("retryBtn")?.addEventListener("click", loadProduct);
  }

}

async function loadRelatedProducts() {

  const relatedSection = document.getElementById("relatedSection");
  if (!relatedSection || !product.category) return;

  try {

    const q = query(
      collection(db, "products"),
      where("category", "==", product.category),
      limit(5)
    );

    const snap = await getDocs(q);

    const related = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => p.id !== product.id)
      .slice(0, 4);

    if (related.length === 0) return;

    relatedSection.innerHTML = `
      <h2 style="font-size:18px;font-weight:800;color:#111827;margin:24px 0 14px;">ಸಂಬಂಧಿತ ಉತ್ಪನ್ನಗಳು (Related Products)</h2>
      <div class="related-grid">
        ${related.map(p => {
          const price = Number(p.price) || 0;
          const mrp = Number(p.mrp) || 0;
          const hasDiscount = mrp > price;
          return `
            <a href="product.html?id=${p.id}" class="related-card">
              <div class="related-card-img"><img src="${escapeHtml(p.image || "")}" alt="${escapeHtml(p.productName)}"></div>
              <div class="related-card-title">${escapeHtml(p.productName)}</div>
              <div class="related-card-price">
                ₹${price}
                ${hasDiscount ? `<span class="related-card-mrp">₹${mrp}</span>` : ""}
              </div>
            </a>
          `;
        }).join("")}
      </div>
    `;

  } catch (error) {
    console.error("Related products error:", error);
  }

}

function render() {

  const price = Number(product.price) || 0;
  const mrp = Number(product.mrp) || 0;
  const hasDiscount = mrp > price;
  const pct = hasDiscount ? Math.round(((mrp - price) / mrp) * 100) : 0;

  const hasStock = typeof product.stock === "number";
  const outOfStock = hasStock && product.stock === 0;

  const hasVariants = Array.isArray(product.colorVariants) && product.colorVariants.length > 0;

  // The product's own base photos need to be selectable too — otherwise,
  // once a customer switches to a colour variant, there's no way back to
  // what they originally opened. It's always option 0.
  const baseLabel = (Array.isArray(product.colours) && product.colours[0]) || "Default";
  allColorOptions = hasVariants
    ? [{ name: baseLabel, images: currentImages.slice() }, ...product.colorVariants]
    : [];

  productMain.innerHTML = `

    <div class="product-gallery">
      <div class="main-image-container" id="mainImgContainer">
        <button class="like-btn" id="likeBtn" aria-label="Like Product">
          <i class="fa-regular fa-heart"></i>
        </button>
        <img src="${escapeHtml(currentImages[0] || "")}" id="mainImg" alt="${escapeHtml(product.productName)}">
      </div>

      <div class="thumbnail-slider" id="thumbContainer"></div>
    </div>

    <div class="product-info">
      <div class="brand-tag">BESTIFY MOBILE</div>
      <h1 class="product-title">${escapeHtml(product.productName)}</h1>

      <div class="price-section">
        <span class="current-price">₹${price}</span>
        ${hasDiscount ? `<span class="old-price">₹${mrp}</span><span class="discount-badge">${pct}% OFF</span>` : ""}
      </div>

      <div class="stock-note ${outOfStock ? "out-stock" : "in-stock"}">${outOfStock ? "Out of Stock" : "✓ In Stock"}</div>

      ${hasVariants ? `
        <div class="variants-section">
          <span class="variant-title">ಬಣ್ಣವನ್ನು ಆಯ್ಕೆ ಮಾಡಿ: <strong id="colorName">${escapeHtml(allColorOptions[0].name)}</strong></span>
          <div class="color-options" id="colorOptions">
            ${allColorOptions.map((v, i) => {
              const thumb = (Array.isArray(v.images) && v.images[0]) || v.image || "";
              return `
              <div>
                <input type="radio" name="color" id="color-${i}" class="color-radio" ${i === 0 ? "checked" : ""} value="${escapeHtml(v.name)}" data-index="${i}">
                <label for="color-${i}" class="color-card">
                  <img src="${escapeHtml(thumb)}" class="color-img" alt="${escapeHtml(v.name)}">
                  <span class="color-name">${escapeHtml(v.name)}</span>
                </label>
              </div>
            `;
            }).join("")}
          </div>
        </div>
      ` : ""}

      ${product.warranty && product.warranty !== "No Warranty" ? `
        <div class="guarantee-box">
          <i class="fa-solid fa-shield-halved fa-2x"></i>
          <div>
            <strong>${escapeHtml(product.warranty)}</strong><br>
            <span>Brand cover, as listed by the seller</span>
          </div>
        </div>
      ` : ""}

      ${product.description ? `
        <div class="product-description">
          <div class="description-title">
            <i class="fa-solid fa-circle-info"></i>
            <span>ವಿವರಣೆ (Product Details):</span>
          </div>
          <p class="description-text">${escapeHtml(product.description)}</p>
        </div>
      ` : ""}

      <div class="action-buttons">
        <button class="btn btn-cart" id="addToCartBtn" ${outOfStock ? "disabled" : ""}><i class="fa-solid fa-cart-shopping"></i> Add to Cart</button>
        <button class="btn btn-buy" id="buyNowBtn" ${outOfStock ? "disabled" : ""}><i class="fa-solid fa-bolt"></i> Buy Now</button>
      </div>
    </div>

  `;

  renderThumbnails();
  attachEvents(outOfStock);

}

function renderThumbnails() {

  const thumbContainer = document.getElementById("thumbContainer");
  if (!thumbContainer) return;

  thumbContainer.innerHTML = "";

  if (currentImages.length <= 1) return;

  currentImages.forEach((imgUrl, index) => {
    const thumbDiv = document.createElement("div");
    thumbDiv.className = `thumb ${index === currentImageIndex ? "active" : ""}`;
    thumbDiv.addEventListener("click", () => setActiveImage(index));

    const imgTag = document.createElement("img");
    imgTag.src = imgUrl;
    imgTag.alt = `Angle ${index + 1}`;

    thumbDiv.appendChild(imgTag);
    thumbContainer.appendChild(thumbDiv);
  });

}

function setActiveImage(index) {
  if (index < 0 || index >= currentImages.length) return;
  currentImageIndex = index;
  document.getElementById("mainImg").src = currentImages[currentImageIndex];
  document.querySelectorAll(".thumb").forEach((thumb, i) => thumb.classList.toggle("active", i === currentImageIndex));
}


function attachEvents(outOfStock) {

  /* Like */
  document.getElementById("likeBtn")?.addEventListener("click", toggleLike);

  /* Colour swatches — switches the gallery to that colour's own photos
     (reuses the exact same gallery/thumbnail code as the base product,
     instead of a separate single-image swap that was more fragile). */
  const colorOptions = document.getElementById("colorOptions");
  if (colorOptions) {
    colorOptions.addEventListener("change", (e) => {
      const radio = e.target.closest(".color-radio");
      if (!radio) return;

      const variant = allColorOptions[Number(radio.dataset.index)];
      document.getElementById("colorName").textContent = variant.name;

      const variantImages = (Array.isArray(variant.images) && variant.images.length)
        ? variant.images
        : [variant.image].filter(Boolean);

      if (!variantImages.length) return; // nothing to show — leave the gallery as-is

      currentImages = variantImages;
      currentImageIndex = 0;
      document.getElementById("mainImg").src = currentImages[0];
      renderThumbnails();
    });
  }

  /* Swipe left/right on the main image */
  const mainImgContainer = document.getElementById("mainImgContainer");
  let touchStartX = 0;

  mainImgContainer.addEventListener("touchstart", (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  mainImgContainer.addEventListener("touchend", (e) => {
    const touchEndX = e.changedTouches[0].screenX;
    const threshold = 50;
    if (touchStartX - touchEndX > threshold) setActiveImage(currentImageIndex + 1);
    else if (touchEndX - touchStartX > threshold) setActiveImage(currentImageIndex - 1);
  }, { passive: true });

  /* Add to Cart / Buy Now */
  if (!outOfStock) {
    document.getElementById("addToCartBtn")?.addEventListener("click", addToCart);
    document.getElementById("buyNowBtn")?.addEventListener("click", buyNow);
  }

}


/* ---------------- Likes (unified with Wishlist) ---------------- */

async function checkLikedStatus() {
  const likeBtn = document.getElementById("likeBtn");
  if (!likeBtn) return;

  if (!currentUser) {
    userHasLiked = false;
    likeBtn.classList.remove("liked");
    return;
  }

  try {
    const wishlistSnap = await getDoc(doc(db, "users", currentUser.uid, "wishlist", productId));
    userHasLiked = wishlistSnap.exists();
    updateLikeIcon(likeBtn);
  } catch (error) {
    console.log(error);
  }
}

function updateLikeIcon(likeBtn) {
  likeBtn.classList.toggle("liked", userHasLiked);
  const icon = likeBtn.querySelector("i");
  icon.className = userHasLiked ? "fa-solid fa-heart" : "fa-regular fa-heart";
}

async function toggleLike() {

  if (!currentUser) {
    alert("Please Login First");
    window.location.href = "login.html";
    return;
  }

  const likeBtn = document.getElementById("likeBtn");
  const wishlistRef = doc(db, "users", currentUser.uid, "wishlist", productId);
  const productRef = doc(db, "products", productId);

  try {
    if (userHasLiked) {
      await deleteDoc(wishlistRef);
      await updateDoc(productRef, { likes: increment(-1) });
      userHasLiked = false;
    } else {
      await setDoc(wishlistRef, product);
      await updateDoc(productRef, { likes: increment(1) });
      userHasLiked = true;
    }
    updateLikeIcon(likeBtn);
  } catch (error) {
    console.error(error);
    alert(error.message || "Could not update like.");
  }

}


/* ---------------- Cart / Buy Now ---------------- */

async function addToCart() {

  if (!currentUser) {
    alert("Please Login First");
    window.location.href = "login.html";
    return;
  }

  const btn = document.getElementById("addToCartBtn");
  btn.disabled = true;

  try {
    const cartRef = doc(db, "users", currentUser.uid, "cart", productId);
    const cartSnap = await getDoc(cartRef);
    const qty = cartSnap.exists() ? (cartSnap.data().qty || 1) + 1 : 1;

    await setDoc(cartRef, { ...product, qty });
    await updateCartBadge();

    btn.innerHTML = `<i class="fa-solid fa-check"></i> Added`;
    setTimeout(() => {
      btn.innerHTML = `<i class="fa-solid fa-cart-shopping"></i> Add to Cart`;
      btn.disabled = false;
    }, 1200);

  } catch (error) {
    console.error(error);
    alert(error.message || "Could not add to cart.");
    btn.disabled = false;
  }

}

function buyNow() {
  if (!currentUser) {
    alert("Please Login First");
    window.location.href = "login.html";
    return;
  }
  window.location.href = `checkout.html?productId=${productId}`;
}


loadProduct();
