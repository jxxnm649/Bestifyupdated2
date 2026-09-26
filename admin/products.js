import { auth, db } from "../firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  deleteDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { showToast as designShowToast } from "../design-system.js";
import { logAdminAction } from "./audit.js";
import { uploadToCloudinary as uploadToCloudinaryWithProgress, mountProgressBar } from "../upload-progress.js";

/* =========================
   STATE
========================= */

let products = [];              // real products, loaded from Firestore
let variantFormRows = [];       // [{id, color, price, mrp, stock, file, previewUrl}]
let baseImageSlots = [null, null, null, null]; // {file, previewUrl} or null, per slot

/* =========================
   DOM
========================= */

const tabInventoryBtn = document.getElementById("tabInventoryBtn");
const tabUploadBtn = document.getElementById("tabUploadBtn");
const viewInventory = document.getElementById("view-inventory");
const viewUpload = document.getElementById("view-upload");

const inventorySearch = document.getElementById("inventory-search");
const filterCategory = document.getElementById("filter-category");
const filterStatus = document.getElementById("filter-status");
const inventoryListContainer = document.getElementById("inventory-list-container");
const emptyState = document.getElementById("empty-state");

const productForm = document.getElementById("product-form");
const baseImageSlotsContainer = document.getElementById("base-image-slots");
const addVariantBtn = document.getElementById("addVariantBtn");
const variantRowsContainer = document.getElementById("variant-rows-container");
const noVariantsNotice = document.getElementById("no-variants-notice");
const resetFormBtn = document.getElementById("resetFormBtn");
const categoryList = document.getElementById("categoryList");

const salesModal = document.getElementById("sales-modal");
const editModal = document.getElementById("edit-modal");
const editForm = document.getElementById("edit-form");

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[m]);
}

function showToast(message, type = "info") {
  try {
    designShowToast(message, type === "danger" ? "danger" : type === "warning" ? "warning" : type === "success" ? "success" : "info");
  } catch {
    alert(message);
  }
}

/* =========================
   ADMIN AUTH GUARD (same real check used elsewhere)
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

  loadProducts();

});


/* =========================
   TAB SWITCH
========================= */

tabInventoryBtn.addEventListener("click", () => switchTab("inventory"));
tabUploadBtn.addEventListener("click", () => switchTab("upload"));

function switchTab(tab) {
  if (tab === "upload") {
    viewUpload.classList.remove("hidden");
    viewInventory.classList.add("hidden");
    tabUploadBtn.className = "px-4 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white";
    tabInventoryBtn.className = "px-4 py-2 rounded-xl text-sm font-semibold bg-slate-100 text-slate-600";
  } else {
    viewInventory.classList.remove("hidden");
    viewUpload.classList.add("hidden");
    tabInventoryBtn.className = "px-4 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white";
    tabUploadBtn.className = "px-4 py-2 rounded-xl text-sm font-semibold bg-slate-100 text-slate-600";
    renderInventory();
  }
}


/* =========================
   LOAD REAL PRODUCTS
========================= */

async function loadProducts() {

  inventoryListContainer.innerHTML = `<div class="text-center py-10 text-slate-400 text-sm">Loading products…</div>`;

  try {

    const snap = await getDocs(collection(db, "products"));
    products = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    populateCategoryOptions();
    renderInventory();

  } catch (error) {
    console.error(error);
    inventoryListContainer.innerHTML = `
      <div class="text-center py-10">
        <p class="text-sm text-red-600">❌ Couldn't load products: ${escapeHtml(error.message || "")}</p>
        <button type="button" id="retryLoadBtn" class="mt-3 px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-semibold">Retry</button>
      </div>`;
    document.getElementById("retryLoadBtn")?.addEventListener("click", loadProducts);
  }

}

function populateCategoryOptions() {

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))].sort();

  filterCategory.innerHTML = `<option value="ALL">All Categories</option>` +
    categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");

  categoryList.innerHTML = categories.map(c => `<option value="${escapeHtml(c)}">`).join("");

}


/* =========================
   BASE IMAGE SLOTS (Add Product form)
========================= */

function renderBaseImageSlots() {

  baseImageSlotsContainer.innerHTML = baseImageSlots.map((slot, i) => `
    <div class="relative cursor-pointer group border-2 border-dashed border-slate-300 hover:border-brand-500 rounded-xl h-24 flex flex-col items-center justify-center bg-slate-50 transition overflow-hidden" data-base-slot="${i}">
      ${slot ? `
        <img src="${slot.previewUrl}" class="w-full h-full object-cover rounded-xl">
        <button type="button" data-remove-base="${i}" class="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center">✕</button>
      ` : `
        <div class="text-center p-2">
          <i class="fa-solid fa-cloud-arrow-up text-slate-400 group-hover:text-brand-600 mb-1"></i>
          <span class="block text-[11px] text-slate-500">Base Image ${i + 1}</span>
        </div>
      `}
      <input type="file" accept="image/*" class="hidden" data-base-file="${i}">
    </div>
  `).join("");

}

baseImageSlotsContainer.addEventListener("click", (e) => {

  const removeBtn = e.target.closest("[data-remove-base]");
  if (removeBtn) {
    baseImageSlots[Number(removeBtn.dataset.removeBase)] = null;
    renderBaseImageSlots();
    return;
  }

  const slot = e.target.closest("[data-base-slot]");
  if (slot) {
    slot.querySelector("[data-base-file]").click();
  }

});

baseImageSlotsContainer.addEventListener("change", (e) => {

  const fileInput = e.target.closest("[data-base-file]");
  if (!fileInput || !fileInput.files[0]) return;

  const index = Number(fileInput.dataset.baseFile);
  const file = fileInput.files[0];
  baseImageSlots[index] = { file, previewUrl: URL.createObjectURL(file) };
  renderBaseImageSlots();

});


/* =========================
   COLOR VARIANT ROWS (Add Product form)
========================= */

addVariantBtn.addEventListener("click", () => {
  variantFormRows.push({ id: "var-" + Date.now() + "-" + Math.floor(Math.random() * 1000), color: "", price: "", mrp: "", stock: 10, file: null, previewUrl: "" });
  renderVariantRows();
});

function renderVariantRows() {

  if (variantFormRows.length === 0) {
    variantRowsContainer.innerHTML = "";
    noVariantsNotice.classList.remove("hidden");
    return;
  }
  noVariantsNotice.classList.add("hidden");

  variantRowsContainer.innerHTML = variantFormRows.map((row, index) => `
    <div class="bg-slate-50 border border-slate-300 rounded-2xl p-4 shadow-sm relative">
      <div class="flex items-center justify-between border-b border-slate-200/80 pb-2 mb-3">
        <span class="text-xs font-bold text-brand-700 uppercase tracking-wider flex items-center gap-2">
          <span class="w-5 h-5 rounded-full bg-brand-600 text-white inline-flex items-center justify-center text-[10px] font-black">${index + 1}</span>
          Color Variant #${index + 1}
        </span>
        <button type="button" data-remove-variant="${row.id}" class="text-xs text-red-500 hover:text-red-700 font-bold flex items-center gap-1 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg">
          <i class="fa-solid fa-trash-can"></i> Remove
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">

        <div class="md:col-span-3">
          <label class="block text-xs font-semibold text-slate-700 mb-1">Color Variant Photo</label>
          <div data-variant-photo-slot="${row.id}" class="relative cursor-pointer group border-2 border-dashed border-slate-300 hover:border-brand-500 rounded-xl h-24 flex flex-col items-center justify-center bg-white transition overflow-hidden">
            ${row.previewUrl ? `<img src="${row.previewUrl}" class="w-full h-full object-cover rounded-xl">` : `
              <div class="text-center p-2">
                <i class="fa-solid fa-camera text-brand-500 text-xl mb-1"></i>
                <span class="block text-[11px] text-slate-500 font-medium">Upload Image</span>
              </div>
            `}
            <input type="file" accept="image/*" class="hidden" data-variant-file="${row.id}">
          </div>
        </div>

        <div class="md:col-span-9 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Color Name *</label>
            <input type="text" required value="${escapeHtml(row.color)}" data-variant-field="color" data-variant-id="${row.id}"
              placeholder="e.g. Matte Black" class="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Price (₹) *</label>
            <input type="number" step="0.01" required value="${row.price}" data-variant-field="price" data-variant-id="${row.id}"
              placeholder="e.g. 999" class="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">MRP (₹) *</label>
            <input type="number" step="0.01" required value="${row.mrp}" data-variant-field="mrp" data-variant-id="${row.id}"
              placeholder="e.g. 1499" class="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Stock *</label>
            <input type="number" min="0" required value="${row.stock}" data-variant-field="stock" data-variant-id="${row.id}"
              placeholder="10" class="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800">
          </div>
        </div>

      </div>
    </div>
  `).join("");

}

variantRowsContainer.addEventListener("click", (e) => {

  const removeBtn = e.target.closest("[data-remove-variant]");
  if (removeBtn) {
    variantFormRows = variantFormRows.filter(r => r.id !== removeBtn.dataset.removeVariant);
    renderVariantRows();
    return;
  }

  const photoSlot = e.target.closest("[data-variant-photo-slot]");
  if (photoSlot) {
    photoSlot.querySelector("[data-variant-file]").click();
  }

});

variantRowsContainer.addEventListener("change", (e) => {

  const fileInput = e.target.closest("[data-variant-file]");
  if (fileInput && fileInput.files[0]) {
    const row = variantFormRows.find(r => r.id === fileInput.dataset.variantFile);
    if (row) {
      row.file = fileInput.files[0];
      row.previewUrl = URL.createObjectURL(row.file);
      renderVariantRows();
    }
    return;
  }

  const field = e.target.closest("[data-variant-field]");
  if (field) {
    const row = variantFormRows.find(r => r.id === field.dataset.variantId);
    if (row) row[field.dataset.variantField] = field.value;
  }

});


/* =========================
   RESET FORM
========================= */

resetFormBtn.addEventListener("click", resetProductForm);

function resetProductForm() {
  productForm.reset();
  baseImageSlots = [null, null, null, null];
  variantFormRows = [];
  renderBaseImageSlots();
  renderVariantRows();
}


/* =========================
   REAL CLOUDINARY UPLOAD (with progress bar near the Save button)
========================= */

let productUploadBar = null;
let productUploadDone = 0;
let productUploadTotal = 0;

async function uploadToCloudinary(file) {
  productUploadDone++;
  const fileNum = productUploadDone;
  return uploadToCloudinaryWithProgress(file, (pct) => {
    if (productUploadBar) {
      productUploadBar.update(pct);
      productUploadBar.label.textContent = `Uploading photo ${fileNum} of ${productUploadTotal}... ${pct}%`;
    }
  });
}


/* =========================
   SUBMIT — SAVE PRODUCT + VARIANTS (real Firestore)
========================= */

productForm.addEventListener("submit", async (e) => {

  e.preventDefault();

  const submitBtn = document.getElementById("submitProductBtn");

  if (variantFormRows.length === 0) {
    showToast("Add at least one color variant — it holds the price and stock.", "danger");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Saving...";

  productUploadDone = 0;
  productUploadTotal = baseImageSlots.filter(s => s?.file).length
    + variantFormRows.filter(r => r.file).length;
  productUploadBar = productUploadTotal > 0 ? mountProgressBar(submitBtn.parentElement) : null;

  try {

    const baseImageUrls = [];
    for (const slot of baseImageSlots) {
      if (slot?.file) baseImageUrls.push(await uploadToCloudinary(slot.file));
    }

    const title = document.getElementById("form-title").value.trim();
    const randomCode = Math.floor(1000 + Math.random() * 9000);

    const colorVariants = [];
    for (let i = 0; i < variantFormRows.length; i++) {

      const row = variantFormRows[i];
      const colorName = (row.color || "").trim();
      const price = parseFloat(row.price);
      const mrp = parseFloat(row.mrp);
      const stock = parseInt(row.stock, 10);

      if (!colorName || isNaN(price) || isNaN(mrp) || isNaN(stock)) {
        throw new Error(`Color variant ${i + 1} is missing a name, price, MRP, or stock value.`);
      }

      let variantImage = baseImageUrls[0] || "";
      if (row.file) variantImage = await uploadToCloudinary(row.file);

      if (!variantImage) {
        throw new Error(`Color variant ${i + 1} ("${colorName}") needs a photo — either its own, or at least one Base Image.`);
      }

      colorVariants.push({
        color: colorName,
        image: variantImage,
        price,
        mrp,
        stock,
        skuId: `SKU-${title.slice(0, 3).toUpperCase()}-${colorName.slice(0, 3).toUpperCase()}-${randomCode + i}`,
        totalSalesCount: 0,
        totalRevenue: 0
      });

    }

    const activeVariant = colorVariants[0];

    const productData = {
      productName: title,
      category: document.getElementById("form-category").value.trim(),
      description: document.getElementById("form-description").value.trim(),
      warranty: document.getElementById("form-warranty").value.trim(),
      returnPolicy: document.getElementById("form-return-policy").value.trim() || "7 Days Return",
      sizeWeight: document.getElementById("form-sizeweight").value.trim(),
      manufacturer: document.getElementById("form-manufacturer").value.trim(),
      productDetails: document.getElementById("form-details").value.trim(),
      images: baseImageUrls.length ? baseImageUrls : [activeVariant.image],
      image: baseImageUrls[0] || activeVariant.image,
      colorVariants,
      activeVariantIndex: 0,
      price: activeVariant.price,
      mrp: activeVariant.mrp,
      stock: activeVariant.stock,
      status: "Active",
      createdAt: new Date()
    };

    const newDoc = await addDoc(collection(db, "products"), productData);

    await logAdminAction("Added product (Inventory Management)", "Products", {
      productId: newDoc.id,
      name: productData.productName,
      variantCount: colorVariants.length
    });

    showToast("Product and variants saved!", "success");
    resetProductForm();
    await loadProducts();
    switchTab("inventory");

  } catch (error) {
    console.error(error);
    showToast(error.message || "Failed to save product.", "danger");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span>Save Product &amp; Variants</span> <i class="fa-solid fa-arrow-right"></i>`;
    if (productUploadBar) { productUploadBar.remove(); productUploadBar = null; }
  }

});


/* =========================
   RENDER INVENTORY LIST (real data)
========================= */

const viewingIndex = {};

inventorySearch.addEventListener("input", renderInventory);
filterCategory.addEventListener("change", renderInventory);
filterStatus.addEventListener("change", renderInventory);

function renderInventory() {

  const term = inventorySearch.value.toLowerCase();
  const category = filterCategory.value;
  const status = filterStatus.value;

  const filtered = products.filter(item => {

    const variants = item.colorVariants || [];
    const matchesSearch = !term ||
      (item.productName || "").toLowerCase().includes(term) ||
      (item.category || "").toLowerCase().includes(term) ||
      variants.some(v => (v.color || "").toLowerCase().includes(term) || (v.skuId || "").toLowerCase().includes(term));

    const matchesCategory = category === "ALL" || item.category === category;
    const matchesStatus = status === "ALL" || (item.status || "Active") === status;

    return matchesSearch && matchesCategory && matchesStatus;

  });

  if (filtered.length === 0) {
    inventoryListContainer.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  inventoryListContainer.innerHTML = filtered.map(item => {

    const variants = item.colorVariants || [];
    const isInactive = item.status === "Inactive";
    const activeIndex = viewingIndex[item.id] ?? item.activeVariantIndex ?? 0;
    const activeVar = variants[activeIndex] || variants[0] || { color: "Default", image: item.image, price: item.price, mrp: item.mrp, stock: item.stock, skuId: "—" };

    return `
    <div class="bg-white rounded-xl border ${isInactive ? "border-amber-200 bg-amber-50/20" : "border-slate-200"} p-3 shadow-sm">

      <div class="flex items-start gap-3">
        <div class="relative w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0">
          <img src="${escapeHtml(activeVar.image || "")}" alt="${escapeHtml(item.productName)}" class="w-full h-full object-cover">
          <span class="absolute bottom-0.5 left-0.5 bg-slate-900/80 text-white text-[9px] font-medium px-1.5 py-0.2 rounded max-w-[90%] truncate">${escapeHtml(activeVar.color)}</span>
          ${isInactive ? '<span class="absolute inset-0 bg-slate-900/60 text-white text-[9px] font-bold flex items-center justify-center">INACTIVE</span>' : ""}
        </div>

        <div class="flex-1 min-w-0 space-y-0.5">
          <div class="flex items-center justify-between gap-1">
            <h4 class="font-bold text-slate-900 text-sm sm:text-base leading-tight truncate">${escapeHtml(item.productName)}</h4>
            <span class="px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${isInactive ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}">${item.status || "Active"}</span>
          </div>

          <div class="flex flex-wrap items-center gap-x-3 gap-y-0 text-[11px] font-mono text-slate-500">
            <span><span class="text-slate-400 font-sans">Category:</span> ${escapeHtml(item.category || "—")}</span>
            <span><span class="text-slate-400 font-sans">SKU:</span> ${escapeHtml(activeVar.skuId || "—")}</span>
          </div>

          <div class="pt-1 flex items-center gap-1 overflow-x-auto">
            <span class="text-[10px] font-semibold text-slate-400 mr-0.5 flex-shrink-0">Colors:</span>
            ${variants.map((v, vIdx) => `
              <button type="button" data-select-variant="${item.id}:${vIdx}"
                class="px-2 py-0.5 rounded-md text-[11px] font-medium transition border flex items-center gap-1 flex-shrink-0 ${vIdx === activeIndex ? "bg-brand-600 text-white border-brand-600" : "bg-slate-50 text-slate-700 border-slate-200"}">
                <span>${escapeHtml(v.color)}</span><span class="text-[9px] opacity-80">(₹${v.price})</span>
              </button>
            `).join("")}
          </div>
        </div>
      </div>

      <div class="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">

        <div class="flex items-baseline gap-1.5">
          <span class="text-[10px] text-slate-400 font-medium">Rate:</span>
          <b class="text-emerald-700 text-sm font-black">₹${Number(activeVar.price || 0).toFixed(2)}</b>
          <span class="text-slate-400 line-through text-[10px]">₹${Number(activeVar.mrp || 0).toFixed(2)}</span>
        </div>

        <div class="flex items-center gap-2 ml-auto">

          <div class="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-lg">
            <button type="button" data-stock-adjust="${item.id}:${activeIndex}:-1" class="w-5 h-5 rounded bg-white border border-slate-300 flex items-center justify-center text-slate-700 font-bold text-xs">-</button>
            <span class="w-7 text-center font-bold text-slate-900 text-xs">${activeVar.stock}</span>
            <button type="button" data-stock-adjust="${item.id}:${activeIndex}:1" class="w-5 h-5 rounded bg-white border border-slate-300 flex items-center justify-center text-slate-700 font-bold text-xs">+</button>
          </div>

          <button type="button" data-edit="${item.id}:${activeIndex}" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1">
            <i class="fa-solid fa-pen text-[10px]"></i> <span class="hidden sm:inline">Edit</span>
          </button>

          <div class="relative" data-more-wrap>
            <button type="button" data-more-toggle class="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1">
              <span>More</span> <i class="fa-solid fa-chevron-down text-[9px]"></i>
            </button>
            <div data-more-menu class="absolute right-0 bottom-full mb-1 w-44 bg-white rounded-xl shadow-xl border border-slate-100 hidden z-30 py-1">
              <button type="button" data-toggle-pause="${item.id}" class="w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-medium">
                <i class="fa-solid ${isInactive ? "fa-play text-emerald-600" : "fa-pause text-amber-600"} w-3.5"></i>
                ${isInactive ? "Set Active" : "Set Inactive"}
              </button>
              <button type="button" data-sales="${item.id}:${activeIndex}" class="w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-medium">
                <i class="fa-solid fa-chart-pie text-brand-600 w-3.5"></i> Total Sale Metrics
              </button>
              <div class="border-t border-slate-100 my-1"></div>
              <button type="button" data-delete="${item.id}" class="w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 flex items-center gap-2 font-medium">
                <i class="fa-solid fa-trash-can w-3.5"></i> Delete Product
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
    `;

  }).join("");

}

inventoryListContainer.addEventListener("click", async (e) => {

  // "More" dropdown — tap to open (hover alone never fires on touch)
  const moreToggle = e.target.closest("[data-more-toggle]");
  if (moreToggle) {
    const menu = moreToggle.closest("[data-more-wrap]").querySelector("[data-more-menu]");
    const wasOpen = !menu.classList.contains("hidden");
    inventoryListContainer.querySelectorAll("[data-more-menu]").forEach(m => m.classList.add("hidden"));
    if (!wasOpen) menu.classList.remove("hidden");
    return;
  }
  inventoryListContainer.querySelectorAll("[data-more-menu]").forEach(m => m.classList.add("hidden"));

  const selectBtn = e.target.closest("[data-select-variant]");
  if (selectBtn) {
    const [productId, vIdx] = selectBtn.dataset.selectVariant.split(":");
    viewingIndex[productId] = Number(vIdx);
    renderInventory();
    return;
  }

  const stockBtn = e.target.closest("[data-stock-adjust]");
  if (stockBtn) {
    const [productId, vIdx, delta] = stockBtn.dataset.stockAdjust.split(":");
    await adjustVariantStock(productId, Number(vIdx), Number(delta));
    return;
  }

  const editBtn = e.target.closest("[data-edit]");
  if (editBtn) {
    const [productId, vIdx] = editBtn.dataset.edit.split(":");
    openEditModal(productId, Number(vIdx));
    return;
  }

  const pauseBtn = e.target.closest("[data-toggle-pause]");
  if (pauseBtn) {
    await togglePauseProduct(pauseBtn.dataset.togglePause);
    return;
  }

  const salesBtn = e.target.closest("[data-sales]");
  if (salesBtn) {
    const [productId, vIdx] = salesBtn.dataset.sales.split(":");
    openSalesModal(productId, Number(vIdx));
    return;
  }

  const deleteBtn = e.target.closest("[data-delete]");
  if (deleteBtn) {
    await deleteProductById(deleteBtn.dataset.delete);
  }

});


/* =========================
   REAL STOCK ADJUST
========================= */

// Older products were created before colour variants existed — they
// only carry top-level price/mrp/stock/image. Fall back to those so
// Edit / stock steppers / sales still work on them.
function resolveVariant(product, variantIndex) {
  return product.colorVariants?.[variantIndex]
    || product.colorVariants?.[0]
    || {
         color: "Default",
         image: product.image || "",
         price: product.price,
         mrp: product.mrp,
         stock: product.stock,
         skuId: product.skuId || ""
       };
}

async function adjustVariantStock(productId, variantIndex, delta) {

  const product = products.find(p => p.id === productId);
  if (!product) return;

  // Older products were saved before colour variants existed — they only
  // have top-level price/mrp/stock. Adjust that directly instead of
  // silently doing nothing.
  if (!product.colorVariants?.length) {

    const newStock = Math.max(0, (Number(product.stock) || 0) + delta);
    product.stock = newStock;
    renderInventory();

    try {
      await updateDoc(doc(db, "products", productId), { stock: newStock });
      await logAdminAction("Adjusted stock (Inventory Management)", "Products", {
        productId, name: product.productName, newStock
      });
    } catch (error) {
      console.error(error);
      designShowToast("Couldn't update stock — try again", "danger");
      loadProducts();
    }

    return;
  }

  if (!product.colorVariants[variantIndex]) return;

  const newStock = Math.max(0, (product.colorVariants[variantIndex].stock || 0) + delta);
  product.colorVariants[variantIndex].stock = newStock;
  renderInventory();

  try {

    const updates = { colorVariants: product.colorVariants };
    if (variantIndex === (product.activeVariantIndex ?? 0)) updates.stock = newStock;

    await updateDoc(doc(db, "products", productId), updates);

  } catch (error) {
    console.error(error);
    showToast(error.message || "Could not update stock.", "danger");
    await loadProducts();
  }

}


/* =========================
   PAUSE / RESUME (Active / Inactive)
========================= */

async function togglePauseProduct(productId) {

  const product = products.find(p => p.id === productId);
  if (!product) return;

  const newStatus = product.status === "Inactive" ? "Active" : "Inactive";

  try {
    await updateDoc(doc(db, "products", productId), { status: newStatus });
    product.status = newStatus;
    renderInventory();
    showToast(`Product set to ${newStatus}`, "warning");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Could not update status.", "danger");
  }

}


/* =========================
   DELETE
========================= */

async function deleteProductById(productId) {

  const product = products.find(p => p.id === productId);
  if (!product) return;

  if (!confirm(`Delete "${product.productName}"? This cannot be undone.`)) return;

  try {
    await deleteDoc(doc(db, "products", productId));
    await logAdminAction("Deleted product (Inventory Management)", "Products", { productId, name: product.productName });
    products = products.filter(p => p.id !== productId);
    renderInventory();
    showToast("Product deleted", "danger");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Could not delete product.", "danger");
  }

}


/* =========================
   SALES METRICS MODAL (real fields — only non-zero once something
   increments them; this pass does not add automatic increment-on-
   delivery, since that needs order data linked to a specific variant)
========================= */

function openSalesModal(productId, variantIndex) {

  const product = products.find(p => p.id === productId);
  if (!product) return;

  const variant = resolveVariant(product, variantIndex);
  if (!variant) return;

  document.getElementById("sales-modal-img").src = variant.image || "";
  document.getElementById("sales-modal-title").textContent = product.productName;
  document.getElementById("sales-modal-variant-info").textContent = `Variant: ${variant.color}`;
  document.getElementById("sales-modal-sku").textContent = `SKU: ${variant.skuId || "—"}`;
  document.getElementById("sales-modal-units").textContent = variant.totalSalesCount || 0;
  document.getElementById("sales-modal-revenue").textContent = `₹${(variant.totalRevenue || 0).toFixed(2)}`;
  document.getElementById("sales-modal-price").textContent = `₹${Number(variant.price || 0).toFixed(2)}`;
  document.getElementById("sales-modal-stock").textContent = `${variant.stock || 0} units`;

  salesModal.classList.remove("hidden");
  salesModal.classList.add("flex");

}

document.getElementById("closeSalesModalBtn").addEventListener("click", closeSalesModal);
document.getElementById("closeSalesModalBtn2").addEventListener("click", closeSalesModal);
function closeSalesModal() {
  salesModal.classList.add("hidden");
  salesModal.classList.remove("flex");
}


/* =========================
   EDIT MODAL (real updateDoc)
========================= */

function openEditModal(productId, variantIndex) {

  const product = products.find(p => p.id === productId);
  if (!product) return;

  const variant = resolveVariant(product, variantIndex);
  if (!variant) return;

  document.getElementById("edit-product-id").value = productId;
  document.getElementById("edit-variant-index").value = variantIndex;
  document.getElementById("edit-title").value = product.productName;
  document.getElementById("edit-status").value = product.status || "Active";

  document.getElementById("edit-variant-header-title").textContent = `Editing Variant: ${variant.color}`;
  document.getElementById("edit-var-color").value = variant.color;
  document.getElementById("edit-var-price").value = variant.price;
  document.getElementById("edit-var-mrp").value = variant.mrp;
  document.getElementById("edit-var-stock").value = variant.stock;

  editModal.classList.remove("hidden");
  editModal.classList.add("flex");

}

document.getElementById("closeEditModalBtn").addEventListener("click", closeEditModal);
document.getElementById("cancelEditBtn").addEventListener("click", closeEditModal);
function closeEditModal() {
  editModal.classList.add("hidden");
  editModal.classList.remove("flex");
}

editForm.addEventListener("submit", async (e) => {

  e.preventDefault();

  const productId = document.getElementById("edit-product-id").value;
  const variantIndex = parseInt(document.getElementById("edit-variant-index").value, 10);

  const product = products.find(p => p.id === productId);
  if (!product) return;

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {

    product.productName = document.getElementById("edit-title").value.trim();
    product.status = document.getElementById("edit-status").value;

    const newColor = document.getElementById("edit-var-color").value.trim();
    const newPrice = parseFloat(document.getElementById("edit-var-price").value);
    const newMrp = parseFloat(document.getElementById("edit-var-mrp").value);
    const newStock = parseInt(document.getElementById("edit-var-stock").value, 10);

    let updates;

    if (!product.colorVariants?.[variantIndex]) {

      // Legacy product with no colour variants — save straight to the
      // product's own top-level fields instead of refusing to save.
      product.price = newPrice;
      product.mrp = newMrp;
      product.stock = newStock;

      updates = {
        productName: product.productName,
        status: product.status,
        price: newPrice,
        mrp: newMrp,
        stock: newStock
      };

    } else {

      product.colorVariants[variantIndex].color = newColor;
      product.colorVariants[variantIndex].price = newPrice;
      product.colorVariants[variantIndex].mrp = newMrp;
      product.colorVariants[variantIndex].stock = newStock;

      updates = {
        productName: product.productName,
        status: product.status,
        colorVariants: product.colorVariants
      };

      if (variantIndex === (product.activeVariantIndex ?? 0)) {
        updates.price = newPrice;
        updates.mrp = newMrp;
        updates.stock = newStock;
      }

    }

    await updateDoc(doc(db, "products", productId), updates);

    await logAdminAction("Edited product (Inventory Management)", "Products", { productId, name: product.productName });

    renderInventory();
    closeEditModal();
    showToast("Changes saved", "success");

  } catch (error) {
    console.error(error);
    showToast(error.message || "Could not save changes.", "danger");
  } finally {
    submitBtn.disabled = false;
  }

});


/* =========================
   INITIAL FORM STATE
========================= */

renderBaseImageSlots();
renderVariantRows();
