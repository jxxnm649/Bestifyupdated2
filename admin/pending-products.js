import { auth, db } from "../firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import {
  openModal,
  closeModal,
  showToast
} from "../design-system.js";

import { logAdminAction } from "./audit.js";

const pendingList = document.getElementById("pendingList");
const pendingCount = document.getElementById("pendingCount");
const pendingVendorFilter = document.getElementById("pendingVendorFilter");

const rejectModal = document.getElementById("rejectModal");
const rejectCloseBtn = document.getElementById("rejectCloseBtn");
const rejectProductName = document.getElementById("rejectProductName");
const rejectForm = document.getElementById("rejectForm");
const rejectReason = document.getElementById("rejectReason");
const rejectSubmitBtn = document.getElementById("rejectSubmitBtn");

let allPending = [];
let vendorNames = new Map();
let rejectTargetId = null;

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

async function loadPending() {

  try {

    const snapshot = await getDocs(
      query(collection(db, "products"), where("approvalStatus", "==", "Pending"))
    );

    allPending = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // Look up vendor shop names for the filter + cards
    const vendorIds = [...new Set(allPending.map(p => p.vendorId).filter(Boolean))];
    vendorNames = new Map();

    await Promise.all(vendorIds.map(async (vid) => {
      try {
        const vSnap = await getDoc(doc(db, "vendors", vid));
        vendorNames.set(vid, vSnap.exists() ? (vSnap.data().shopName || "Vendor") : "Vendor");
      } catch {
        vendorNames.set(vid, "Vendor");
      }
    }));

    pendingVendorFilter.innerHTML = `<option value="All">All Suppliers</option>` +
      vendorIds.map(vid => `<option value="${escapeHtml(vid)}">${escapeHtml(vendorNames.get(vid) || "Vendor")}</option>`).join("");

    renderList();

  } catch (error) {
    console.error("Pending products load error:", error);
    pendingList.innerHTML = `<div class="bf-card" style="padding:20px;">❌ Unable to load pending products.</div>`;
  }

}

function renderList() {

  const vendorFilter = pendingVendorFilter.value;
  const filtered = vendorFilter === "All" ? allPending : allPending.filter(p => p.vendorId === vendorFilter);

  pendingCount.textContent = `${filtered.length} product${filtered.length === 1 ? "" : "s"} awaiting review`;

  if (!filtered.length) {
    pendingList.innerHTML = `<div class="bf-card" style="padding:20px;">🎉 No pending products — all caught up!</div>`;
    return;
  }

  pendingList.innerHTML = filtered.map(p => `
    <div class="bf-card" style="padding:14px;display:flex;flex-direction:column;gap:8px;">
      <img src="${escapeHtml(p.image || "")}" alt="${escapeHtml(p.productName || "")}" style="width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:10px;">
      <div style="font-weight:700;font-size:14px;">${escapeHtml(p.productName || "Unnamed product")}</div>
      <div style="font-size:12px;opacity:.7;">🏬 ${escapeHtml(vendorNames.get(p.vendorId) || "Vendor")}</div>
      <div style="font-size:13px;">₹${escapeHtml(String(p.price ?? 0))} · ${escapeHtml(p.category || "Uncategorized")}</div>
      <div style="display:flex;gap:6px;margin-top:6px;">
        <button type="button" class="bf-btn bf-btn-primary bf-btn-sm approve-pending-btn" data-id="${escapeHtml(p.id)}" style="flex:1;">✅ Approve</button>
        <button type="button" class="bf-btn bf-btn-ghost bf-btn-sm reject-pending-btn" data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(p.productName || "")}" style="flex:1;color:#c62828;">❌ Reject</button>
      </div>
      <div style="display:flex;gap:6px;">
        <button type="button" class="bf-btn bf-btn-ghost bf-btn-sm delete-pending-btn" data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(p.productName || "")}" style="flex:1;color:#c62828;">🗑️ Delete</button>
      </div>
    </div>
  `).join("");

}

pendingVendorFilter.addEventListener("change", renderList);

async function approveProduct(id) {

  try {

    await updateDoc(doc(db, "products", id), {
      approvalStatus: "Approved",
      rejectionReason: ""
    });

    await logAdminAction("Approved vendor product", "Products", { productId: id });

    allPending = allPending.filter(p => p.id !== id);
    renderList();
    showToast("Product approved — now live", "success");

  } catch (error) {
    console.error("Approve product error:", error);
    showToast(error.message || "Failed to approve product.", "danger");
  }

}

async function deleteProduct(id, name) {

  const ok = window.confirm(`Delete "${name}"? This cannot be undone.`);
  if (!ok) return;

  try {
    await deleteDoc(doc(db, "products", id));
    await logAdminAction("Deleted pending vendor product", "Products", { productId: id, name });
    allPending = allPending.filter(p => p.id !== id);
    renderList();
    showToast("Product deleted", "success");
  } catch (error) {
    console.error("Delete product error:", error);
    showToast(error.message || "Failed to delete product.", "danger");
  }

}

pendingList.addEventListener("click", (e) => {

  const approveBtn = e.target.closest(".approve-pending-btn");
  if (approveBtn) {
    approveProduct(approveBtn.dataset.id);
    return;
  }

  const rejectBtn = e.target.closest(".reject-pending-btn");
  if (rejectBtn) {
    rejectTargetId = rejectBtn.dataset.id;
    rejectProductName.textContent = rejectBtn.dataset.name || "";
    rejectReason.value = "";
    openModal("rejectModal");
    return;
  }

  const deleteBtn = e.target.closest(".delete-pending-btn");
  if (deleteBtn) {
    deleteProduct(deleteBtn.dataset.id, deleteBtn.dataset.name);
  }

});

if (rejectCloseBtn) {
  rejectCloseBtn.addEventListener("click", () => closeModal("rejectModal"));
}

if (rejectForm) {
  rejectForm.addEventListener("submit", async (e) => {

    e.preventDefault();
    if (!rejectTargetId) return;

    rejectSubmitBtn.disabled = true;
    rejectSubmitBtn.textContent = "Saving...";

    try {

      await updateDoc(doc(db, "products", rejectTargetId), {
        approvalStatus: "Rejected",
        rejectionReason: rejectReason.value.trim()
      });

      await logAdminAction("Rejected vendor product", "Products", {
        productId: rejectTargetId,
        reason: rejectReason.value.trim()
      });

      allPending = allPending.filter(p => p.id !== rejectTargetId);
      renderList();
      showToast("Product rejected", "success");
      closeModal("rejectModal");
      rejectTargetId = null;

    } catch (error) {
      console.error("Reject product error:", error);
      showToast(error.message || "Failed to reject product.", "danger");
    } finally {
      rejectSubmitBtn.disabled = false;
      rejectSubmitBtn.textContent = "Reject Product";
    }

  });
}


/* =========================
   APP INIT (ADMIN CHECK)
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

  loadPending();

});
