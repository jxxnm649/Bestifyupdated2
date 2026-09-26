import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const welcome = document.getElementById("welcome");
const featuredContainer = document.getElementById("featuredContainer");
const featuredTitle = document.getElementById("featuredTitle");
const categoryBar = document.getElementById("categoryBar");
const searchInput = document.getElementById("searchInput");
const bannerTrack = document.getElementById("bannerTrack");
const bannerDots = document.getElementById("bannerDots");
const displayArea = document.getElementById("displayArea");
const productsSectionTitle = document.getElementById("productsSectionTitle");

let allProducts = [];
let activeCategory = "All";
let activeMode = "all";
let likedProductIds = new Set(); // real wishlist, used for "Liked First"

// User Details
onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {

    const docRef = doc(db, "users", user.uid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {

      const data = docSnap.data();

      if (welcome) welcome.innerHTML = `👋 Welcome <b>${data.name}</b>`;

    } else {

      if (welcome) welcome.innerHTML = `👋 Welcome <b>${user.email}</b>`;

    }

  } catch (error) {

    console.log(error);

    if (welcome) welcome.innerHTML = `👋 Welcome <b>${user.email}</b>`;

  }

  // Real wishlist — used by the "Liked First" view mode below.
  try {
    const wishlistSnap = await getDocs(collection(db, "users", user.uid, "wishlist"));
    likedProductIds = new Set(wishlistSnap.docs.map(d => d.id));
  } catch (error) {
    console.log(error);
  }

});

// ---------- Banner Slider ----------
const banners = [
  { cls: "b1", title: "Bestify Days 🎉", text: "Fresh drops added every week" },
  { cls: "b2", title: "Up to 40% Off", text: "On our top rated picks" },
  { cls: "b3", title: "Free Delivery", text: "On your first order today" }
];

function renderBanner() {
  if (!bannerTrack || !bannerDots) return;

  bannerTrack.innerHTML = banners.map(b => `
    <div class="banner-slide ${b.cls}">
      <h3>${b.title}</h3>
      <p>${b.text}</p>
    </div>
  `).join("");

  bannerDots.innerHTML = banners.map((_, i) =>
    `<span data-i="${i}" class="${i === 0 ? "active" : ""}"></span>`
  ).join("");
}

let bannerIndex = 0;
function goToBanner(i) {
  if (!bannerTrack || !bannerDots) return;
  bannerIndex = i;
  bannerTrack.style.transform = `translateX(-${i * 100}%)`;
  [...bannerDots.children].forEach((dot, idx) =>
    dot.classList.toggle("active", idx === i)
  );
}

function startBannerAuto() {
  if (!bannerTrack || !bannerDots) return;
  setInterval(() => {
    goToBanner((bannerIndex + 1) % banners.length);
  }, 4000);
}

if (bannerTrack && bannerDots) {
  renderBanner();
  goToBanner(0);
  startBannerAuto();

  bannerDots.addEventListener("click", (e) => {
    if (e.target.dataset.i !== undefined) {
      goToBanner(Number(e.target.dataset.i));
    }
  });
}

// ---------- Skeleton ----------
function renderSkeletons(container, count = 4) {
  container.innerHTML = Array.from({ length: count }).map(() => `
    <div class="skeleton-card">
      <div class="skeleton-img"></div>
      <div class="skeleton-body">
        <div class="skeleton-line w60"></div>
        <div class="skeleton-line w40"></div>
      </div>
    </div>
  `).join("");
}

// ---------- Product card (Bestify card design) ----------
function escapeAttr(str) {
  return String(str ?? "").replace(/"/g, "&quot;");
}

function productCardHTML(p) {
  const hasStock = typeof p.stock === "number";
  const outOfStock = hasStock && p.stock === 0;
  const lowStock = hasStock && p.stock > 0 && p.stock <= 5;

  const mrp = Number(p.mrp) || 0;
  const price = Number(p.price) || 0;
  const hasDiscount = mrp > price;
  const pct = hasDiscount ? Math.round(((mrp - price) / mrp) * 100) : 0;

  return `
    <div class="bf-card" data-id="${p.id}">
      ${hasDiscount ? `<span class="bf-sale-badge">${pct}% OFF</span>` : ""}
      <button class="bf-share-btn" data-id="${p.id}" data-name="${escapeAttr(p.productName)}" aria-label="Share">📤</button>

      <div class="bf-carousel">
        <img src="${p.image}" alt="${p.productName}">
      </div>

      <h2 class="bf-title">${p.productName}</h2>

      <div class="bf-price-section">
        <div class="bf-price-row">
          ${hasDiscount ? `<span class="bf-original-price">₹${mrp}</span>` : ""}
          <span class="bf-current-price">₹${price}</span>
        </div>
        ${hasStock ? `<span class="stock-badge ${outOfStock ? "out" : lowStock ? "low" : "in"}" style="margin-top:6px;display:inline-block;">
          ${outOfStock ? "Out of Stock" : lowStock ? `Only ${p.stock} left` : "In Stock"}
        </span>` : ""}
      </div>

      <div class="bf-button-group">
        <button class="bf-btn-cart" data-id="${p.id}" ${outOfStock ? "disabled" : ""}>🛒 Add</button>
        <button class="bf-btn-buy" data-id="${p.id}" ${outOfStock ? "disabled" : ""}>${outOfStock ? "Out of Stock" : "Buy Now"}</button>
      </div>
    </div>
  `;
}

// ---------- Compact catalog card (main product grid) ----------
function isRecentlyAdded(p) {
  const ts = p.createdAt;
  const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
  if (!d || isNaN(d.getTime())) return false;
  return (Date.now() - d.getTime()) < 14 * 24 * 60 * 60 * 1000; // real "new" = added in the last 14 days
}

function catalogCardHTML(p) {
  const hasStock = typeof p.stock === "number";
  const outOfStock = hasStock && p.stock === 0;

  const mrp = Number(p.mrp) || 0;
  const price = Number(p.price) || 0;
  const hasDiscount = mrp > price;
  const discountPct = hasDiscount ? Math.round(((mrp - price) / mrp) * 100) : 0;

  // Real image gallery — falls back to the single main image if this
  // product doesn't have a separate images[] array.
  const images = (Array.isArray(p.images) && p.images.length) ? p.images : [p.image].filter(Boolean);
  const isLiked = likedProductIds.has(p.id);

  return `
    <div class="catalog-item" data-id="${p.id}">
      <div class="catalog-img-wrapper">
        ${hasDiscount ? `<span class="catalog-badge-new">${discountPct}% OFF</span>` : ""}
        <div class="catalog-img-slider">
          ${images.map(src => `<img src="${src}" alt="${escapeAttr(p.productName)}">`).join("")}
        </div>
        ${images.length > 1 ? `
          <div class="catalog-slider-dots">
            ${images.map((_, i) => `<span class="catalog-dot ${i === 0 ? "active" : ""}"></span>`).join("")}
          </div>
        ` : ""}
      </div>
      <div class="catalog-card-content">
        <div class="catalog-info-row">
          <div class="catalog-title-group">
            <div class="catalog-title">${p.productName}</div>
            <div class="catalog-price-row">
              <span class="catalog-price">₹${price}</span>
              ${hasDiscount ? `<span class="catalog-mrp">₹${mrp}</span>` : ""}
            </div>
          </div>
          <div class="catalog-quick-actions">
            <button type="button" class="catalog-like-btn ${isLiked ? "liked" : ""}" data-id="${p.id}" aria-label="Like">${isLiked ? "❤️" : "🤍"}</button>
            <button type="button" class="catalog-share-btn" data-id="${p.id}" data-name="${escapeAttr(p.productName)}" aria-label="Share">📤</button>
          </div>
        </div>
        <div class="catalog-stock-badge">${outOfStock ? "Out of Stock" : "In Stock"}</div>
        <div class="catalog-btn-row">
          <button class="catalog-add-btn" data-id="${p.id}" ${outOfStock ? "disabled" : ""}>🛒 Add</button>
          <button class="catalog-buy-btn" data-id="${p.id}" ${outOfStock ? "disabled" : ""}>${outOfStock ? "Out of Stock" : "BUY NOW"}</button>
        </div>
      </div>
    </div>
  `;
}

// ---------- Add to cart (from card) ----------
async function handleAddToCart(id) {

  const user = auth.currentUser;

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {

    const productRef = doc(db, "products", id);
    const productSnap = await getDoc(productRef);

    if (!productSnap.exists()) return;

    const cartRef = doc(db, "users", user.uid, "cart", id);
    const cartSnap = await getDoc(cartRef);
    const qty = cartSnap.exists() ? (cartSnap.data().qty || 1) + 1 : 1;

    await setDoc(cartRef, { ...productSnap.data(), qty });

    alert("Added to Cart ✅");

  } catch (error) {
    console.log(error);
    alert(error.message);
  }

}

function attachCardEvents(container) {
  container.addEventListener("click", async (e) => {

    const shareBtn = e.target.closest(".bf-share-btn");
    if (shareBtn) {
      e.stopPropagation();

      const shareUrl = new URL(`product.html?id=${shareBtn.dataset.id}`, window.location.href).href;
      const shareData = {
        title: shareBtn.dataset.name || "Bestify",
        text: `Check out ${shareBtn.dataset.name || "this product"} on Bestify`,
        url: shareUrl
      };

      try {
        if (navigator.share) {
          await navigator.share(shareData);
        } else {
          await navigator.clipboard.writeText(shareUrl);
          alert("Link copied!");
        }
      } catch (error) {
        // user cancelled the share sheet — nothing to do
      }
      return;
    }

    const cartBtn = e.target.closest(".bf-btn-cart");
    if (cartBtn) {
      e.stopPropagation();
      handleAddToCart(cartBtn.dataset.id);
      return;
    }

    const buyBtn = e.target.closest(".bf-btn-buy");
    if (buyBtn) {
      e.stopPropagation();
      window.location.href = `checkout.html?productId=${buyBtn.dataset.id}`;
      return;
    }

    const card = e.target.closest(".bf-card");
    if (card) {
      window.location.href = `product.html?id=${card.dataset.id}`;
    }

  });
}

// ---------- Catalog grid clicks (direct navigate — no popup) ----------
function attachCatalogEvents(container) {
  container.addEventListener("click", async (e) => {

    const likeBtn = e.target.closest(".catalog-like-btn");
    if (likeBtn) {
      e.stopPropagation();
      const id = likeBtn.dataset.id;
      const product = allProducts.find(p => p.id === id) || featured_cache.find(p => p.id === id);
      const user = auth.currentUser;
      if (!product || !user) return;

      const isLiked = likedProductIds.has(id);
      likeBtn.disabled = true;

      try {
        if (isLiked) {
          await deleteDoc(doc(db, "users", user.uid, "wishlist", id));
          likedProductIds.delete(id);
        } else {
          await setDoc(doc(db, "users", user.uid, "wishlist", id), product);
          likedProductIds.add(id);
        }
        likeBtn.textContent = likedProductIds.has(id) ? "❤️" : "🤍";
        likeBtn.classList.toggle("liked", likedProductIds.has(id));
      } catch (error) {
        console.error(error);
      } finally {
        likeBtn.disabled = false;
      }
      return;
    }

    const shareBtn = e.target.closest(".catalog-share-btn");
    if (shareBtn) {
      e.stopPropagation();
      const shareUrl = new URL(`product.html?id=${shareBtn.dataset.id}`, window.location.href).href;
      try {
        if (navigator.share) {
          await navigator.share({ title: shareBtn.dataset.name || "Bestify", text: `Check out ${shareBtn.dataset.name || "this product"} on Bestify`, url: shareUrl });
        } else {
          await navigator.clipboard.writeText(shareUrl);
          alert("Link copied!");
        }
      } catch (error) {
        // cancelled — nothing to do
      }
      return;
    }

    const addBtn = e.target.closest(".catalog-add-btn");
    if (addBtn) {
      e.stopPropagation();
      if (addBtn.disabled) return;
      handleAddToCart(addBtn.dataset.id);
      return;
    }

    const buyBtn = e.target.closest(".catalog-buy-btn");
    if (buyBtn) {
      e.stopPropagation();
      if (buyBtn.disabled) return;
      window.location.href = `checkout.html?productId=${buyBtn.dataset.id}`;
      return;
    }

    const item = e.target.closest(".catalog-item");
    if (item) {
      window.location.href = `product.html?id=${item.dataset.id}`;
    }

  });

  // Sync the dot indicators as each card's image slider is swiped.
  container.addEventListener("scroll", (e) => {
    const slider = e.target.closest(".catalog-img-slider");
    if (!slider) return;
    const dots = slider.parentElement.querySelectorAll(".catalog-dot");
    if (!dots.length) return;
    const index = Math.round(slider.scrollLeft / slider.clientWidth);
    dots.forEach((dot, i) => dot.classList.toggle("active", i === index));
  }, true);
}

attachCatalogEvents(displayArea);
attachCatalogEvents(featuredContainer);

// ---------- Category chips ----------
const categoryIcons = {
  all: "fa-solid fa-border-all",
  speaker: "fa-solid fa-volume-high",
  cover: "fa-solid fa-mobile-screen-button",
  covers: "fa-solid fa-mobile-screen-button",
  case: "fa-solid fa-mobile-screen-button",
  cases: "fa-solid fa-mobile-screen-button",
  charger: "fa-solid fa-bolt",
  chargers: "fa-solid fa-bolt",
  cable: "fa-solid fa-plug",
  cables: "fa-solid fa-plug",
  earphone: "fa-solid fa-headphones",
  earphones: "fa-solid fa-headphones",
  headphone: "fa-solid fa-headphones",
  headphones: "fa-solid fa-headphones",
  battery: "fa-solid fa-battery-full",
  batteries: "fa-solid fa-battery-full",
  watch: "fa-solid fa-clock",
  watches: "fa-solid fa-clock",
  mobile: "fa-solid fa-mobile",
  mobiles: "fa-solid fa-mobile",
  accessory: "fa-solid fa-tags",
  accessories: "fa-solid fa-tags"
};

function iconForCategory(c) {
  return categoryIcons[String(c).toLowerCase()] || "fa-solid fa-tag";
}

function normalizeText(str) {
  return String(str || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function renderCategories(products) {
  // De-dupe categories ignoring case/whitespace (e.g. "Cover" and "cover " are the same chip)
  const seen = new Map();
  products.forEach(p => {
    const raw = (p.category || "").toString().replace(/\s+/g, " ").trim();
    if (!raw) return;
    const key = normalizeText(raw);
    if (!seen.has(key)) seen.set(key, raw);
  });

  const categories = ["All", ...seen.values()];

  categoryBar.innerHTML = categories.map(c => `
    <div class="category-chip ${normalizeText(c) === normalizeText(activeCategory) ? "active" : ""}" data-cat="${c}">
      <i class="${iconForCategory(c)}"></i><span>${c}</span>
    </div>
  `).join("");
}

categoryBar.addEventListener("click", (e) => {
  const chip = e.target.closest(".category-chip");
  if (!chip) return;
  activeCategory = chip.dataset.cat;
  renderCategories(allProducts);
  applyFilters();
});

// ---------- Search ----------
searchInput.addEventListener("input", applyFilters);

function applyFilters() {
  const term = searchInput.value.trim().toLowerCase();

  const filtered = allProducts.filter(p => {
    const matchesCategory = normalizeText(activeCategory) === "all"
      || normalizeText(p.category) === normalizeText(activeCategory);
    const matchesSearch = !term
      || (p.productName || "").toLowerCase().includes(term)
      || (p.description || "").toLowerCase().includes(term)
      || (p.category || "").toLowerCase().includes(term);
    return matchesCategory && matchesSearch;
  });

  // Hide Best Sellers while actively searching or filtering by category,
  // so an unrelated row of items doesn't make it look like the filter
  // isn't working.
  if (featuredTitle && featuredContainer) {
    const show = !term && activeCategory === "All" && featured_cache.length > 0;
    featuredTitle.style.display = show ? "block" : "none";
    featuredContainer.style.display = show ? "grid" : "none";
  }

  if (filtered.length === 0) {
    displayArea.innerHTML = `<p class="no-results">No products found 😔</p>`;
    return;
  }

  renderDisplay(filtered);
}

// ---------- View modes: All / Date Wise / Category Wise / Liked First
// (all built from real product + real wishlist data — nothing fake) ----------
function renderDisplay(products) {

  if (activeMode === "date") {

    const groups = new Map(); // label -> products[]
    products.forEach(p => {
      const ts = p.createdAt;
      const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
      const label = (d && !isNaN(d.getTime()))
        ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
        : "Date not available";
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(p);
    });

    displayArea.innerHTML = [...groups.entries()].map(([label, items]) => `
      <div class="date-section-title">📅 ${label} <span class="section-count">${items.length} item${items.length > 1 ? "s" : ""}</span></div>
      <div class="catalog-grid">${items.map(catalogCardHTML).join("")}</div>
    `).join("");

  } else if (activeMode === "category") {

    const groups = new Map();
    products.forEach(p => {
      const label = (p.category || "").toString().trim() || "Uncategorized";
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(p);
    });

    displayArea.innerHTML = [...groups.entries()].map(([label, items]) => `
      <div class="date-section-title">🏷️ ${label} <span class="section-count">${items.length} item${items.length > 1 ? "s" : ""}</span></div>
      <div class="catalog-grid">${items.map(catalogCardHTML).join("")}</div>
    `).join("");

  } else if (activeMode === "interest") {

    // Real signal: this customer's own wishlist, not fake "trending" data.
    const liked = products.filter(p => likedProductIds.has(p.id));
    const rest = products.filter(p => !likedProductIds.has(p.id));

    let html = "";
    if (liked.length) {
      html += `<div class="date-section-title">❤️ From your Liked list <span class="section-count">${liked.length} item${liked.length > 1 ? "s" : ""}</span></div><div class="catalog-grid">${liked.map(catalogCardHTML).join("")}</div>`;
    } else {
      html += `<div class="date-section-title">❤️ From your Liked list <span class="section-count">0 items</span></div><p class="no-results" style="margin:6px 0 14px;">You haven't liked anything yet — tap the heart on a product to see it here.</p>`;
    }
    html += `<div class="date-section-title">${liked.length ? "🛍️ More products" : "🛍️ All products"} <span class="section-count">${rest.length} item${rest.length > 1 ? "s" : ""}</span></div><div class="catalog-grid">${rest.map(catalogCardHTML).join("")}</div>`;
    displayArea.innerHTML = html;

  } else {

    displayArea.innerHTML = `<div class="catalog-grid">${products.map(catalogCardHTML).join("")}</div>`;

  }

}

let featured_cache = [];

// ---------- Load Products ----------
async function loadProducts() {

  displayArea.innerHTML = `<div class="catalog-grid"></div>`;
  renderSkeletons(featuredContainer, 4);

  try {

    const snapshot = await getDocs(collection(db, "products"));

    console.log("Products Found :", snapshot.size);

    if (snapshot.empty) {
      displayArea.innerHTML = `<p class="no-results">No Products Found</p>`;
      if (featuredContainer) featuredContainer.innerHTML = "";
      return;
    }

    allProducts = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(p => p.status !== "Inactive") // Hide vendor/admin-paused products from the storefront
      .filter(p => p.approvalStatus !== "Pending" && p.approvalStatus !== "Rejected"); // Hide vendor submissions awaiting admin review

    // Real current best discount for the banner slide — computed from
    // actual product pricing rather than a hardcoded "% OFF" claim.
    const storeOfferEl = document.getElementById("storeOfferText");
    if (storeOfferEl) {
      const discounts = allProducts
        .map(p => {
          const mrp = Number(p.mrp) || 0;
          const price = Number(p.price) || 0;
          return mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
        })
        .filter(pct => pct > 0);

      storeOfferEl.textContent = discounts.length
        ? `Get up to ${Math.max(...discounts)}% OFF on select products`
        : "Check out our latest products";
    }

    renderCategories(allProducts);

    // Featured / Best Sellers: top 4 products
    featured_cache = allProducts.slice(0, 4);
    if (featured_cache.length > 0) {
      featuredTitle.style.display = "block";
      featuredContainer.innerHTML = featured_cache.map(catalogCardHTML).join("");
    }

    applyFilters();

  } catch (error) {

    console.log(error);

    displayArea.innerHTML = `<p class="no-results">Error loading products</p>`;

  }

}

loadProducts();


/* =========================
   GRID / ZOOMED VIEW TOGGLE
   (pure display preference, no data involved)
========================= */

const zoomSlider = document.getElementById("zoomSlider");

function setZoomedView(isZoomed) {
  document.body.classList.toggle("zoomed-in", isZoomed);
}

if (zoomSlider) {
  setZoomedView(zoomSlider.value === "1");
  zoomSlider.addEventListener("input", () => setZoomedView(zoomSlider.value === "1"));

  // Pinch out to zoom in, pinch in to zoom out.
  let pinchStartDist = null;

  document.addEventListener("touchmove", (e) => {
    if (e.touches.length !== 2) return;

    const dist = Math.hypot(
      e.touches[0].pageX - e.touches[1].pageX,
      e.touches[0].pageY - e.touches[1].pageY
    );

    if (pinchStartDist === null) {
      pinchStartDist = dist;
      return;
    }

    if (dist - pinchStartDist > 40) {
      zoomSlider.value = "1";
      setZoomedView(true);
      pinchStartDist = dist;
    } else if (pinchStartDist - dist > 40) {
      zoomSlider.value = "0";
      setZoomedView(false);
      pinchStartDist = dist;
    }

  }, { passive: true });

  document.addEventListener("touchend", (e) => {
    if (e.touches.length < 2) pinchStartDist = null;
  });
}


/* =========================
   FLOATING NAV — real profile avatar (photo if set, else
   initials), same source of truth as profile-menu.js's nav icon.
========================= */

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  const avatarInner = document.getElementById("fnavAvatarInner");
  if (!avatarInner) return;

  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    const data = snap.exists() ? snap.data() : {};
    const seed = data.name || user.email || "U";

    if (data.profilePicture) {
      avatarInner.innerHTML = `<img src="${data.profilePicture}" alt="My Account">`;
    } else {
      avatarInner.textContent = seed.charAt(0).toUpperCase();
    }
  } catch (error) {
    console.log(error);
  }
});

/* =========================
   Bestify social bar — auto-scrolling ticker
   (moves one item left every 2s, loops seamlessly)
========================= */
(function () {
  const track = document.querySelector("#bestify-social .social-track");
  if (!track) return;

  const originalItems = Array.from(track.querySelectorAll(".social-item"));
  if (originalItems.length < 2) return;

  // clone the set once so the strip can loop seamlessly
  originalItems.forEach((item) => track.appendChild(item.cloneNode(true)));

  let position = 0;
  const total = originalItems.length;

  function moveNext() {
    position++;

    const item = track.querySelector(".social-item");
    const itemWidth = item.getBoundingClientRect().width;
    const gap = window.innerWidth <= 600 ? 4 : 5;

    track.style.transform = `translateX(-${position * (itemWidth + gap)}px)`;

    if (position >= total) {
      setTimeout(() => {
        track.style.transition = "none";
        position = 0;
        track.style.transform = "translateX(0)";
        track.offsetHeight; // force repaint
        track.style.transition = "transform .65s cubic-bezier(.4,0,.2,1)";
      }, 700);
    }
  }

  setInterval(moveNext, 2000);
})();

/* =========================
   Delivery pincode line — display only, not a real
   serviceability check. Just remembers what the customer typed.
========================= */
(function () {
  const label = document.getElementById("deliveryPincode");
  const editBtn = document.getElementById("editPincodeBtn");
  if (!label || !editBtn) return;

  const saved = localStorage.getItem("bf_delivery_pincode");
  if (saved) label.textContent = saved;

  editBtn.addEventListener("click", () => {
    const value = prompt("Enter your delivery pincode:", label.textContent.trim());
    if (value && value.trim()) {
      label.textContent = value.trim();
      localStorage.setItem("bf_delivery_pincode", value.trim());
    }
  });
})();

/* =========================
   Auto-scrolling carousels (admin-uploaded banners + shop photos).
   Auto-advances every 3s; manual swipe is tracked so autoplay
   continues from wherever the person left it.
========================= */
function setupAutoCarousel(scrollEl, contentEl, urls, altText) {
  if (!scrollEl || !contentEl || !urls.length) return; // keep whatever static fallback is already in the HTML

  contentEl.innerHTML = urls
    .map(u => `<img src="${u}" alt="${altText}">`)
    .join("");

  if (urls.length < 2) return; // nothing to auto-scroll between

  let index = 0;
  let userScrolling = false;
  let scrollTimeout = null;

  scrollEl.addEventListener("scroll", () => {
    userScrolling = true;
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      index = Math.round(scrollEl.scrollLeft / scrollEl.clientWidth);
      userScrolling = false;
    }, 150);
  });

  setInterval(() => {
    if (userScrolling) return;
    index = (index + 1) % urls.length;
    scrollEl.scrollTo({ left: index * scrollEl.clientWidth, behavior: "smooth" });
  }, 3000);
}

(async function () {
  const bannerCarousel = document.getElementById("homeBannerCarousel");
  const shopPhotoContainer = document.getElementById("shopPhotoContainer");
  const shopPhotoSlider = document.getElementById("shopPhotoSlider");
  if (!bannerCarousel && !shopPhotoContainer) return;

  try {
    const snap = await getDoc(doc(db, "settings", "store"));
    const data = snap.exists() ? snap.data() : {};

    let bannerUrls = [];
    if (Array.isArray(data.homeBanners) && data.homeBanners.length) {
      bannerUrls = data.homeBanners.filter(b => !b.hidden).map(b => b.url);
    } else if (data.homeBannerUrl) {
      bannerUrls = [data.homeBannerUrl];
    }
    setupAutoCarousel(bannerCarousel, bannerCarousel, bannerUrls, "Bestify Mobile Kolavi");

    let shopPhotoUrls = [];
    if (Array.isArray(data.shopPhotos) && data.shopPhotos.length) {
      shopPhotoUrls = data.shopPhotos.filter(p => !p.hidden).map(p => p.url);
    }
    setupAutoCarousel(shopPhotoContainer, shopPhotoSlider, shopPhotoUrls, "Bestify Mobile Kolavi shop photo");

  } catch (error) {
    console.log(error);
  }
})();
