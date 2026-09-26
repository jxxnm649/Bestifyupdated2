/* ============================================================
   Bestify Supplier Portal — My Products
   (rebuilt in STEP 0 hotfix — the previous file contained CSS
   instead of JavaScript, so this page never ran)

   What a vendor can do here:
   - see only their OWN products (vendorId == their uid)
   - add a product         -> goes to admin as approvalStatus "Pending"
   - edit a product        -> goes back to "Pending" for re-approval
   - change stock          -> no re-approval needed
   - switch Active/Inactive-> no re-approval needed

   What a vendor can NOT do here: set approvalStatus to Approved,
   touch commission, or edit anyone else's products. Those stay
   admin-controlled (and must also be enforced by firestore.rules).
   ============================================================ */

import { db } from "../firebase.js";

import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { guardVendorPage, wireLogout } from "./vendor-common.js";
import { showToast, openModal, closeModal } from "../design-system.js";
import { uploadToCloudinary, mountProgressBar } from "../upload-progress.js";

const MAX_IMAGES = 8;
const PRESET_RETURN = ["7 Days Return", "No Return"];
const PRESET_WARRANTY = ["6 Month Warranty", "No Warranty"];

/* ---------- Element refs (all exist in vendor/products.html) ---------- */

const $ = (id) => document.getElementById(id);

const addProductBtn = $("addProductBtn");
const productSearch = $("productSearch");
const productStatusFilter = $("productStatusFilter");
const productCount = $("productCount");
const productsList = $("productsList");

const productForm = $("productForm");
const productFormTitle = $("productFormTitle");
const productFormCloseBtn = $("productFormCloseBtn");
const productFormSubmitBtn = $("productFormSubmitBtn");
const imageFileInput = $("imageFile");
const imageCountLabel = $("imageCountLabel");
const previewRow = $("previewRow");
const categoryList = $("categoryList");

const returnPolicySelect = $("returnPolicy");
const returnPolicyCustom = $("returnPolicyCustom");
const warrantySelect = $("warranty");
const warrantyCustom = $("warrantyCustom");

/* ---------- State ---------- */

let currentVendor = null;
let myProducts = [];
let editingProductId = null;

// Images in the form, in order. Each is either an already-uploaded
// URL ({ url }) or a new local file waiting to upload ({ file, previewUrl }).
let formImages = [];

/* ---------- Helpers ---------- */

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[m]);
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

function toTime(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  } catch {
    return 0;
  }
}

function approvalPill(p) {
  const s = p.approvalStatus || "Approved";
  if (s === "Pending") return `<span class="bf-status-pill bf-status-pending">⏳ Awaiting approval</span>`;
  if (s === "Rejected") return `<span class="bf-status-pill bf-status-danger">✕ Rejected</span>`;
  return `<span class="bf-status-pill bf-status-success">✓ Live</span>`;
}

function statusPill(p) {
  return p.status === "Inactive"
    ? `<span class="bf-status-pill bf-status-warning">Inactive</span>`
    : `<span class="bf-status-pill bf-status-progress">Active</span>`;
}

/* Select + "Custom" text box pairs (return policy, warranty) */

function wireCustomSelect(select, customInput) {
  select.addEventListener("change", () => {
    customInput.style.display = select.value === "Custom" ? "block" : "none";
  });
}

function setCustomSelect(select, customInput, presets, value) {
  if (!value || presets.includes(value)) {
    select.value = value || presets[0];
    customInput.value = "";
    customInput.style.display = "none";
  } else {
    select.value = "Custom";
    customInput.value = value;
    customInput.style.display = "block";
  }
}

function readCustomSelect(select, customInput, fallback) {
  if (select.value === "Custom") return customInput.value.trim() || fallback;
  return select.value;
}

/* ============================================================
   LOAD + RENDER
   ============================================================ */

async function loadProducts() {

  productCount.textContent = "Loading products...";

  try {

    const snap = await getDocs(
      query(collection(db, "products"), where("vendorId", "==", currentVendor.id))
    );

    myProducts = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));

    categoryList.innerHTML = [...new Set(myProducts.map(p => p.category).filter(Boolean))]
      .sort()
      .map(c => `<option value="${escapeHtml(c)}">`)
      .join("");

    renderProducts();

  } catch (error) {
    console.error("Vendor products load error:", error);
    productCount.textContent = "";
    productsList.innerHTML = `
      <div class="bf-card" style="padding:20px;">
        ❌ Unable to load your products.
        <button type="button" class="bf-btn bf-btn-ghost bf-btn-sm" id="retryLoadBtn" style="margin-left:8px;">Retry</button>
      </div>`;
    $("retryLoadBtn")?.addEventListener("click", loadProducts);
  }

}

function getFilteredProducts() {
  const term = productSearch.value.trim().toLowerCase();
  const status = productStatusFilter.value;

  return myProducts.filter(p => {
    const matchesStatus = status === "All" || (p.status || "Active") === status;
    const matchesTerm = !term ||
      String(p.productName || "").toLowerCase().includes(term) ||
      String(p.category || "").toLowerCase().includes(term);
    return matchesStatus && matchesTerm;
  });
}

function renderProducts() {

  const list = getFilteredProducts();

  productCount.textContent = `${list.length} product${list.length === 1 ? "" : "s"}`;

  if (!myProducts.length) {
    productsList.innerHTML = `
      <div class="bf-card" style="padding:20px;">
        📦 You haven't added any products yet. Tap <strong>+ Add Product</strong> to list your first one.
      </div>`;
    return;
  }

  if (!list.length) {
    productsList.innerHTML = `<div class="bf-card" style="padding:20px;">No products match your search.</div>`;
    return;
  }

  productsList.innerHTML = list.map(p => {
    const img = p.image || (Array.isArray(p.images) ? p.images[0] : "") || "";
    const stock = Number(p.stock) || 0;
    const isInactive = p.status === "Inactive";

    return `
      <div class="bf-card" style="padding:14px;display:flex;flex-direction:column;gap:8px;">
        <div style="aspect-ratio:1/1;background:var(--surface-2,#f4f4f6);border-radius:10px;overflow:hidden;">
          ${img ? `<img src="${escapeHtml(img)}" alt="" style="width:100%;height:100%;object-fit:cover;">` : ""}
        </div>
        <div style="font-weight:700;font-size:14px;line-height:1.3;">${escapeHtml(p.productName || "Product")}</div>
        <div style="font-size:12px;opacity:.7;">${escapeHtml(p.category || "")}</div>
        <div style="font-size:14px;">
          <strong>₹${Number(p.price) || 0}</strong>
          ${Number(p.mrp) > Number(p.price) ? `<span style="text-decoration:line-through;opacity:.55;margin-left:6px;">₹${Number(p.mrp)}</span>` : ""}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">${approvalPill(p)} ${statusPill(p)}</div>
        ${p.approvalStatus === "Rejected" && p.rejectionReason
          ? `<div style="font-size:12px;color:#c62828;">Reason: ${escapeHtml(p.rejectionReason)}</div>` : ""}

        <div style="display:flex;align-items:center;gap:8px;font-size:13px;">
          <span>Stock:</span>
          <button type="button" class="bf-btn bf-btn-ghost bf-btn-sm" data-stock="${p.id}:-1" aria-label="Decrease stock" style="flex:0 0 auto;width:36px;min-width:36px;padding:0;">−</button>
          <strong style="min-width:24px;text-align:center;">${stock}</strong>
          <button type="button" class="bf-btn bf-btn-ghost bf-btn-sm" data-stock="${p.id}:1" aria-label="Increase stock" style="flex:0 0 auto;width:36px;min-width:36px;padding:0;">+</button>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:auto;">
          <button type="button" class="bf-btn bf-btn-primary bf-btn-sm" data-edit="${p.id}">✏️ Edit</button>
          <button type="button" class="bf-btn bf-btn-ghost bf-btn-sm" data-toggle="${p.id}">
            ${isInactive ? "▶ Activate" : "⏸ Deactivate"}
          </button>
        </div>
      </div>
    `;
  }).join("");

}

/* ============================================================
   QUICK ACTIONS (no re-approval needed)
   ============================================================ */

async function changeStock(productId, delta) {
  const p = myProducts.find(x => x.id === productId);
  if (!p) return;

  const newStock = Math.max(0, (Number(p.stock) || 0) + delta);
  if (newStock === (Number(p.stock) || 0)) return;

  try {
    await updateDoc(doc(db, "products", productId), { stock: newStock, updatedAt: serverTimestamp() });
    p.stock = newStock;
    renderProducts();
  } catch (error) {
    console.error("Stock update error:", error);
    showToast(error.message || "Couldn't update stock.", "danger");
  }
}

async function toggleStatus(productId) {
  const p = myProducts.find(x => x.id === productId);
  if (!p) return;

  const newStatus = p.status === "Inactive" ? "Active" : "Inactive";

  try {
    await updateDoc(doc(db, "products", productId), { status: newStatus, updatedAt: serverTimestamp() });
    p.status = newStatus;
    renderProducts();
    showToast(newStatus === "Active" ? "Product activated" : "Product hidden from the store", "success");
  } catch (error) {
    console.error("Status update error:", error);
    showToast(error.message || "Couldn't update status.", "danger");
  }
}

productsList.addEventListener("click", (e) => {
  const stockBtn = e.target.closest("[data-stock]");
  if (stockBtn) {
    const [id, delta] = stockBtn.dataset.stock.split(":");
    changeStock(id, Number(delta));
    return;
  }

  const editBtn = e.target.closest("[data-edit]");
  if (editBtn) {
    openForm(myProducts.find(p => p.id === editBtn.dataset.edit) || null);
    return;
  }

  const toggleBtn = e.target.closest("[data-toggle]");
  if (toggleBtn) toggleStatus(toggleBtn.dataset.toggle);
});

productSearch.addEventListener("input", renderProducts);
productStatusFilter.addEventListener("change", renderProducts);

/* ============================================================
   ADD / EDIT FORM
   ============================================================ */

function renderPreviews() {
  imageCountLabel.textContent = `${formImages.length}/${MAX_IMAGES}`;

  previewRow.innerHTML = formImages.map((img, i) => `
    <div style="position:relative;width:64px;height:64px;border-radius:8px;overflow:hidden;border:${i === 0 ? "2px solid var(--accent,#D98925)" : "1px solid var(--line,#ddd)"};">
      <img src="${escapeHtml(img.url || img.previewUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;">
      <button type="button" data-remove-img="${i}" aria-label="Remove photo"
        style="position:absolute;top:2px;right:2px;width:20px;height:20px;border-radius:50%;border:none;background:rgba(0,0,0,.6);color:#fff;font-size:12px;line-height:20px;padding:0;cursor:pointer;">✕</button>
    </div>
  `).join("");
}

previewRow.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-remove-img]");
  if (!btn) return;
  formImages.splice(Number(btn.dataset.removeImg), 1);
  renderPreviews();
});

imageFileInput.addEventListener("change", () => {
  const files = [...(imageFileInput.files || [])];
  const room = MAX_IMAGES - formImages.length;

  if (files.length > room) {
    showToast(`Only ${MAX_IMAGES} photos allowed — extra ones were skipped.`, "info");
  }

  files.slice(0, Math.max(0, room)).forEach(file => {
    formImages.push({ file, previewUrl: URL.createObjectURL(file) });
  });

  imageFileInput.value = "";
  renderPreviews();
});

function openForm(product) {

  editingProductId = product ? product.id : null;
  productForm.reset();

  productFormTitle.textContent = product ? "Edit Product" : "Add Product";

  $("productName").value = product?.productName || "";
  $("category").value = product?.category || "";
  $("mrp").value = product?.mrp ?? "";
  $("price").value = product?.price ?? "";
  $("stock").value = product?.stock ?? "";
  $("description").value = product?.description || "";
  $("sizes").value = Array.isArray(product?.sizes) ? product.sizes.join(", ") : "";
  $("colours").value = Array.isArray(product?.colours) ? product.colours.join(", ") : "";
  $("status").value = product?.status === "Inactive" ? "Inactive" : "Active";

  setCustomSelect(returnPolicySelect, returnPolicyCustom, PRESET_RETURN, product?.returnPolicy);
  setCustomSelect(warrantySelect, warrantyCustom, PRESET_WARRANTY, product?.warranty);

  const existing = Array.isArray(product?.images) && product.images.length
    ? product.images
    : (product?.image ? [product.image] : []);
  formImages = existing.slice(0, MAX_IMAGES).map(url => ({ url }));
  renderPreviews();

  productFormSubmitBtn.textContent = "Save Product";
  productFormSubmitBtn.disabled = false;

  openModal("productFormModal");
}

function closeForm() {
  closeModal("productFormModal");
  editingProductId = null;
  formImages = [];
}

addProductBtn.addEventListener("click", () => openForm(null));
productFormCloseBtn.addEventListener("click", closeForm);

wireCustomSelect(returnPolicySelect, returnPolicyCustom);
wireCustomSelect(warrantySelect, warrantyCustom);

async function uploadPendingImages() {

  const pending = formImages.filter(img => img.file && !img.url);
  if (!pending.length) return;

  const bar = mountProgressBar(productFormSubmitBtn.parentElement);

  try {
    for (let i = 0; i < pending.length; i++) {
      const img = pending[i];
      img.url = await uploadToCloudinary(img.file, (pct) => {
        const overall = ((i + pct / 100) / pending.length) * 100;
        bar.update(overall);
        productFormSubmitBtn.textContent = `Uploading photos... ${Math.round(overall)}%`;
      });
    }
    bar.done();
  } finally {
    bar.remove();
  }
}

productForm.addEventListener("submit", async (e) => {

  e.preventDefault();
  if (!currentVendor || productFormSubmitBtn.disabled) return;

  const productName = $("productName").value.trim();
  const category = $("category").value.trim();
  const price = Number($("price").value);
  const mrpRaw = $("mrp").value.trim();
  const mrp = mrpRaw === "" ? price : Number(mrpRaw);
  const stock = parseInt($("stock").value, 10);
  const description = $("description").value.trim();

  if (!productName || !category || !description) {
    showToast("Please fill in name, category and description.", "danger");
    return;
  }
  if (!Number.isFinite(price) || price <= 0) {
    showToast("Enter a valid selling price.", "danger");
    return;
  }
  if (!Number.isFinite(mrp) || mrp < price) {
    showToast("MRP can't be lower than the selling price.", "danger");
    return;
  }
  if (!Number.isInteger(stock) || stock < 0) {
    showToast("Enter a valid stock quantity.", "danger");
    return;
  }
  if (!formImages.length) {
    showToast("Add at least one product photo.", "danger");
    return;
  }

  productFormSubmitBtn.disabled = true;
  productFormSubmitBtn.textContent = "Saving...";

  try {

    await uploadPendingImages();

    const images = formImages.map(img => img.url).filter(Boolean);

    // Fields a vendor is allowed to set. approvalStatus is always
    // reset to "Pending" so every new listing or edit is reviewed by
    // the admin before it shows on the store.
    const productData = {
      productName,
      category,
      price,
      mrp,
      stock,
      description,
      image: images[0],
      images,
      sizes: splitList($("sizes").value),
      colours: splitList($("colours").value),
      returnPolicy: readCustomSelect(returnPolicySelect, returnPolicyCustom, PRESET_RETURN[0]),
      warranty: readCustomSelect(warrantySelect, warrantyCustom, PRESET_WARRANTY[0]),
      status: $("status").value === "Inactive" ? "Inactive" : "Active",
      vendorName: currentVendor.shopName || currentVendor.ownerName || "Vendor",
      approvalStatus: "Pending",
      rejectionReason: "",
      updatedAt: serverTimestamp()
    };

    if (editingProductId) {

      await updateDoc(doc(db, "products", editingProductId), productData);
      showToast("Changes saved — sent to admin for re-approval.", "success");

    } else {

      await addDoc(collection(db, "products"), {
        ...productData,
        vendorId: currentVendor.id,
        createdAt: serverTimestamp()
      });
      showToast("Product submitted — it will go live once the admin approves it.", "success");

    }

    closeForm();
    await loadProducts();

  } catch (error) {

    console.error("Vendor product save error:", error);
    showToast(
      error.code === "permission-denied"
        ? "You don't have permission to save this product. Please contact support."
        : (error.message || "Failed to save product."),
      "danger"
    );

  } finally {

    productFormSubmitBtn.disabled = false;
    productFormSubmitBtn.textContent = "Save Product";

  }

});

/* ============================================================
   INIT
   ============================================================ */

wireLogout($("logoutBtn"));

guardVendorPage((user, vendor) => {
  currentVendor = { ...vendor, id: user.uid };
  loadProducts();
});
