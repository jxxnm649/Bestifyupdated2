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
  updateDoc,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import {
  openModal,
  closeModal,
  showToast
} from "../design-system.js";

import { logAdminAction } from "./audit.js";


const form = document.getElementById("vendorForm");
const vendorsList = document.getElementById("vendorsList");
const vendorCount = document.getElementById("vendorCount");
const vendorSearch = document.getElementById("vendorSearch");
const vendorStatusFilter = document.getElementById("vendorStatusFilter");

const addVendorBtn = document.getElementById("addVendorBtn");
const vendorFormModal = document.getElementById("vendorFormModal");
const vendorFormCloseBtn = document.getElementById("vendorFormCloseBtn");
const vendorFormTitle = document.getElementById("vendorFormTitle");
const vendorFormSubmitBtn = document.getElementById("vendorFormSubmitBtn");

let editMode = false;
let editVendorId = null;
let allVendors = [];


/* =========================
   HELPERS
========================= */

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function formatDate(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

function statusPillClass(status) {
  if (status === "Blocked") return "bf-status-danger";
  if (status === "Active") return "bf-status-success";
  return "bf-status-pending";
}


/* =========================
   MODAL OPEN / CLOSE
========================= */

function resetForm() {
  form.reset();
  document.getElementById("vendorStatus").value = "Pending";
  document.getElementById("commissionRate").value = 10;
  editMode = false;
  editVendorId = null;
  vendorFormTitle.textContent = "Add Vendor";
  vendorFormSubmitBtn.textContent = "Save Vendor";
}

if (addVendorBtn) {
  addVendorBtn.addEventListener("click", () => {
    resetForm();
    openModal("vendorFormModal");
  });
}

if (vendorFormCloseBtn) {
  vendorFormCloseBtn.addEventListener("click", () => {
    closeModal("vendorFormModal");
  });
}


/* =========================
   SUBMIT (ADD / UPDATE)
========================= */

form.addEventListener("submit", async (e) => {

  e.preventDefault();

  vendorFormSubmitBtn.disabled = true;
  vendorFormSubmitBtn.textContent = editMode ? "Updating..." : "Saving...";

  try {

    const vendorData = {
      shopName: document.getElementById("shopName").value.trim(),
      ownerName: document.getElementById("ownerName").value.trim(),
      email: document.getElementById("vendorEmail").value.trim(),
      phone: document.getElementById("vendorPhone").value.trim(),
      category: document.getElementById("vendorCategory").value.trim(),
      address: document.getElementById("vendorAddress").value.trim(),
      commissionRate: Number(document.getElementById("commissionRate").value) || 0,
      status: document.getElementById("vendorStatus").value
    };

    if (editMode) {

      await updateDoc(doc(db, "vendors", editVendorId), vendorData);
      await logAdminAction("Updated vendor", "Vendors", {
        vendorId: editVendorId,
        shopName: vendorData.shopName
      });
      showToast("Vendor updated", "success");

    } else {

      const newDoc = await addDoc(collection(db, "vendors"), {
        ...vendorData,
        createdAt: serverTimestamp()
      });
      await logAdminAction("Added vendor", "Vendors", {
        vendorId: newDoc.id,
        shopName: vendorData.shopName
      });
      showToast("Vendor added", "success");

    }

    closeModal("vendorFormModal");
    resetForm();
    loadVendors();

  } catch (error) {

    console.error("Vendor save error:", error);
    showToast(error.message || "Failed to save vendor.", "danger");

  } finally {

    vendorFormSubmitBtn.disabled = false;
    vendorFormSubmitBtn.textContent = editMode ? "Update Vendor" : "Save Vendor";

  }

});


/* =========================
   LOAD & RENDER
========================= */

async function loadVendors() {

  try {

    const snapshot = await getDocs(collection(db, "vendors"));

    allVendors = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    renderVendorList();

  } catch (error) {

    console.error("Vendors loading error:", error);

    vendorsList.innerHTML = `
      <div class="bf-card" style="padding:20px;">
        ❌ Unable to load vendors.
      </div>
    `;

  }

}

function getFilteredVendors() {

  const term = vendorSearch.value.trim().toLowerCase();
  const statusFilter = vendorStatusFilter.value;

  return allVendors.filter((vendor) => {

    const shop = (vendor.shopName || "").toLowerCase();
    const owner = (vendor.ownerName || "").toLowerCase();
    const phone = (vendor.phone || "").toLowerCase();
    const status = vendor.status || "Pending";

    const matchesTerm = !term || shop.includes(term) || owner.includes(term) || phone.includes(term);
    const matchesStatus = statusFilter === "All" || status === statusFilter;

    return matchesTerm && matchesStatus;

  });

}

function renderVendorList() {

  const filtered = getFilteredVendors();

  vendorCount.textContent = `Total Vendors: ${allVendors.length}`;

  if (!filtered.length) {
    vendorsList.innerHTML = `
      <div class="bf-card" style="padding:20px;">
        No vendors found.
      </div>
    `;
    return;
  }

  vendorsList.innerHTML = filtered.map((vendor) => {

    const status = vendor.status || "Pending";

    return `
      <div class="bf-card" style="padding:16px; display:flex; flex-direction:column; gap:6px;">

        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <div style="font-weight:700; font-size:15px;">
            ${escapeHtml(vendor.shopName || "Unnamed shop")}
            ${vendor.userId ? `<span class="bf-status-pill bf-status-pending" style="margin-left:6px;font-size:10px;">🏪 Self-signup</span>` : ""}
          </div>

          <span class="bf-status-pill ${statusPillClass(status)}">${escapeHtml(status)}</span>
        </div>

        <div style="font-size:13px; opacity:.75;">
          👤 ${escapeHtml(vendor.ownerName || "Not available")}
        </div>

        <div style="font-size:13px; opacity:.75;">
          📞 ${escapeHtml(vendor.phone || "Not available")}
        </div>

        <div style="font-size:13px; opacity:.75;">
          ✉️ ${escapeHtml(vendor.email || "Not available")}
        </div>

        ${vendor.category ? `
          <div style="font-size:12px; opacity:.6;">
            ${escapeHtml(vendor.category)}
          </div>
        ` : ""}

        <div style="font-size:13px; margin-top:4px;">
          Commission: <b>${escapeHtml(String(vendor.commissionRate ?? 0))}%</b>
        </div>

        <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">

          <button
            type="button"
            class="bf-btn bf-btn-ghost bf-btn-sm view-vendor-btn"
            data-id="${escapeHtml(vendor.id)}"
            style="flex:1;">
            📊 Details
          </button>

          <button
            type="button"
            class="bf-btn bf-btn-ghost bf-btn-sm edit-vendor-btn"
            data-id="${escapeHtml(vendor.id)}"
            style="flex:1;">
            ✏️ Edit
          </button>

          ${status === "Pending" ? `
            <button
              type="button"
              class="bf-btn bf-btn-ghost bf-btn-sm approve-vendor-btn"
              data-id="${escapeHtml(vendor.id)}"
              style="flex:1; color:#2F7A4F;">
              ✅ Approve
            </button>
          ` : `
            <button
              type="button"
              class="bf-btn bf-btn-ghost bf-btn-sm toggle-block-vendor-btn"
              data-id="${escapeHtml(vendor.id)}"
              data-blocked="${status === "Blocked"}"
              style="flex:1;">
              ${status === "Blocked" ? "Unblock" : "Block"}
            </button>
          `}

          <button
            type="button"
            class="bf-btn bf-btn-ghost bf-btn-sm delete-vendor-btn"
            data-id="${escapeHtml(vendor.id)}"
            data-name="${escapeHtml(vendor.shopName || "this vendor")}"
            style="flex:1; color:#c62828;">
            🗑️ Delete
          </button>

        </div>

      </div>
    `;

  }).join("");

}

if (vendorSearch) {
  vendorSearch.addEventListener("input", renderVendorList);
}

if (vendorStatusFilter) {
  vendorStatusFilter.addEventListener("change", renderVendorList);
}


/* =========================
   EDIT / BLOCK / DELETE
========================= */

async function editVendor(id) {

  try {

    const vendorRef = doc(db, "vendors", id);
    const vendorSnap = await getDoc(vendorRef);

    if (!vendorSnap.exists()) {
      showToast("Vendor not found", "danger");
      return;
    }

    const vendor = vendorSnap.data();

    document.getElementById("shopName").value = vendor.shopName || "";
    document.getElementById("ownerName").value = vendor.ownerName || "";
    document.getElementById("vendorEmail").value = vendor.email || "";
    document.getElementById("vendorPhone").value = vendor.phone || "";
    document.getElementById("vendorCategory").value = vendor.category || "";
    document.getElementById("vendorAddress").value = vendor.address || "";
    document.getElementById("commissionRate").value = vendor.commissionRate ?? 10;
    document.getElementById("vendorStatus").value = vendor.status || "Pending";

    editMode = true;
    editVendorId = id;

    vendorFormTitle.textContent = "Edit Vendor";
    vendorFormSubmitBtn.textContent = "Update Vendor";

    openModal("vendorFormModal");

  } catch (error) {

    console.error("Edit vendor error:", error);
    showToast(error.message || "Failed to load vendor.", "danger");

  }

}

async function approveVendor(id) {

  try {

    await updateDoc(doc(db, "vendors", id), { status: "Active" });

    await logAdminAction("Approved vendor", "Vendors", { vendorId: id });

    const idx = allVendors.findIndex(v => v.id === id);
    if (idx !== -1) {
      allVendors[idx] = { ...allVendors[idx], status: "Active" };
      renderVendorList();
    }

    showToast("Vendor approved — they now have dashboard access", "success");

  } catch (error) {

    console.error("Vendor approve error:", error);
    showToast(error.message || "Failed to approve vendor.", "danger");

  }

}

async function toggleBlockVendor(id, isCurrentlyBlocked) {

  const nextStatus = isCurrentlyBlocked ? "Active" : "Blocked";

  const confirmMsg = isCurrentlyBlocked
    ? "Unblock this vendor and restore their access?"
    : "Block this vendor? They will no longer be able to sell on Bestify.";

  if (!window.confirm(confirmMsg)) return;

  try {

    await updateDoc(doc(db, "vendors", id), { status: nextStatus });

    await logAdminAction(
      nextStatus === "Blocked" ? "Blocked vendor" : "Unblocked vendor",
      "Vendors",
      { vendorId: id }
    );

    const idx = allVendors.findIndex(v => v.id === id);
    if (idx !== -1) {
      allVendors[idx] = { ...allVendors[idx], status: nextStatus };
      renderVendorList();
    }

    showToast(nextStatus === "Blocked" ? "Vendor blocked" : "Vendor unblocked", "success");

  } catch (error) {

    console.error("Vendor block/unblock error:", error);
    showToast(error.message || "Failed to update vendor status.", "danger");

  }

}

async function deleteVendor(id, name) {

  const ok = window.confirm(`Delete "${name}"? This cannot be undone.`);
  if (!ok) return;

  try {

    await deleteDoc(doc(db, "vendors", id));

    await logAdminAction("Deleted vendor", "Vendors", { vendorId: id, name });

    allVendors = allVendors.filter(v => v.id !== id);
    renderVendorList();

    showToast("Vendor deleted", "success");

  } catch (error) {

    console.error("Delete vendor error:", error);
    showToast(error.message || "Failed to delete vendor.", "danger");

  }

}

if (vendorsList) {
  vendorsList.addEventListener("click", (e) => {

    const viewBtn = e.target.closest(".view-vendor-btn");
    if (viewBtn) {
      openVendorDetail(viewBtn.dataset.id);
      return;
    }

    const editBtn = e.target.closest(".edit-vendor-btn");
    if (editBtn) {
      editVendor(editBtn.dataset.id);
      return;
    }

    const approveBtn = e.target.closest(".approve-vendor-btn");
    if (approveBtn) {
      approveVendor(approveBtn.dataset.id);
      return;
    }

    const blockBtn = e.target.closest(".toggle-block-vendor-btn");
    if (blockBtn) {
      toggleBlockVendor(blockBtn.dataset.id, blockBtn.dataset.blocked === "true");
      return;
    }

    const deleteBtn = e.target.closest(".delete-vendor-btn");
    if (deleteBtn) {
      deleteVendor(deleteBtn.dataset.id, deleteBtn.dataset.name);
    }

  });
}


/* =========================
   VENDOR DETAIL (products / earnings / wallet — khatabook style)
========================= */

const vendorDetailModal = document.getElementById("vendorDetailModal");
const vendorDetailCloseBtn = document.getElementById("vendorDetailCloseBtn");
const vendorDetailTitle = document.getElementById("vendorDetailTitle");
const vdProductCount = document.getElementById("vdProductCount");
const vdTotalEarnings = document.getElementById("vdTotalEarnings");
const vdWalletBalance = document.getElementById("vdWalletBalance");
const vdEarningsPanel = document.getElementById("vdEarningsPanel");
const vdWalletPanel = document.getElementById("vdWalletPanel");
const vdProductsPanel = document.getElementById("vdProductsPanel");
const vdAdjustWalletBtn = document.getElementById("vdAdjustWalletBtn");

let currentDetailVendor = null;

if (vendorDetailCloseBtn) {
  vendorDetailCloseBtn.addEventListener("click", () => closeModal("vendorDetailModal"));
}

document.querySelectorAll(".vd-tab").forEach((tabBtn) => {
  tabBtn.addEventListener("click", () => {
    document.querySelectorAll(".vd-tab").forEach(b => b.classList.remove("active"));
    tabBtn.classList.add("active");
    document.querySelectorAll(".vd-panel").forEach(p => p.style.display = "none");
    document.getElementById(`vd${tabBtn.dataset.tab.charAt(0).toUpperCase()}${tabBtn.dataset.tab.slice(1)}Panel`).style.display = "block";
  });
});

async function openVendorDetail(id) {

  const vendor = allVendors.find(v => v.id === id);
  if (!vendor) return;

  currentDetailVendor = vendor;

  vendorDetailTitle.textContent = vendor.shopName || "Vendor Details";
  vdProductCount.textContent = "—";
  vdTotalEarnings.textContent = "—";
  vdWalletBalance.textContent = `₹${Number(vendor.walletBalance || 0).toLocaleString("en-IN")}`;
  vdEarningsPanel.innerHTML = "Loading...";
  vdWalletPanel.innerHTML = "Loading...";
  vdProductsPanel.innerHTML = "Loading...";

  openModal("vendorDetailModal");

  try {

    const [productsSnap, commissionsSnap, walletTxSnap] = await Promise.all([
      getDocs(query(collection(db, "products"), where("vendorId", "==", id))),
      getDocs(query(collection(db, "commissions"), where("vendorId", "==", id))),
      getDocs(query(collection(db, "vendorWalletTransactions"), where("vendorId", "==", id)))
    ]);

    const products = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const commissions = commissionsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (toMillis(b.createdAt)) - (toMillis(a.createdAt)));
    const walletTx = walletTxSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (toMillis(b.createdAt)) - (toMillis(a.createdAt)));

    vdProductCount.textContent = products.length;

    const totalEarnings = commissions.reduce((s, c) => s + Number(c.commissionAmount || 0), 0);
    vdTotalEarnings.textContent = `₹${totalEarnings.toLocaleString("en-IN")}`;

    vdEarningsPanel.innerHTML = commissions.length
      ? commissions.map(c => `
          <div class="bf-card" style="padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;gap:10px;">
            <div>
              <div style="font-weight:700;">₹${escapeHtml(String(c.commissionAmount ?? 0))} commission</div>
              <div style="font-size:12px;opacity:.65;">Order: ₹${escapeHtml(String(c.orderAmount ?? 0))} · ${escapeHtml(String(c.commissionRate ?? 0))}% · ${formatDate(c.createdAt)}</div>
            </div>
            <span class="bf-status-pill ${c.status === "Collected" ? "bf-status-success" : "bf-status-pending"}">${escapeHtml(c.status || "Pending")}</span>
          </div>
        `).join("")
      : `<div class="bf-card" style="padding:16px;">No earnings recorded yet.</div>`;

    vdWalletPanel.innerHTML = walletTx.length
      ? walletTx.map(t => `
          <div class="bf-card" style="padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;gap:10px;">
            <div>
              <div style="font-weight:700;color:${t.type === "credit" ? "#2F7A4F" : "#c62828"};">
                ${t.type === "credit" ? "+" : "-"}₹${escapeHtml(String(t.amount ?? 0))}
              </div>
              <div style="font-size:12px;opacity:.65;">${escapeHtml(t.reason || "")} · ${formatDate(t.createdAt)}</div>
            </div>
            <div style="font-size:12px;opacity:.6;align-self:center;">Bal: ₹${escapeHtml(String(t.balanceAfter ?? 0))}</div>
          </div>
        `).join("")
      : `<div class="bf-card" style="padding:16px;">No wallet activity yet.</div>`;

    vdProductsPanel.innerHTML = products.length
      ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;">` +
        products.map(p => `
          <div class="bf-card" style="padding:8px;">
            <img src="${escapeHtml(p.image || "")}" style="width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:8px;">
            <div style="font-size:12px;font-weight:600;margin-top:6px;">${escapeHtml(p.productName || "")}</div>
            <div style="font-size:12px;opacity:.7;">₹${escapeHtml(String(p.price ?? 0))}</div>
          </div>
        `).join("") + `</div>`
      : `<div class="bf-card" style="padding:16px;">No products added yet.</div>`;

  } catch (error) {
    console.error("Vendor detail load error:", error);
    vdEarningsPanel.innerHTML = `<div class="bf-card" style="padding:16px;">❌ Unable to load data.</div>`;
  }

}

function toMillis(ts) {
  if (!ts) return 0;
  return ts?.toDate ? ts.toDate().getTime() : new Date(ts).getTime();
}


/* =========================
   ADJUST VENDOR WALLET
========================= */

const vendorWalletAdjustModal = document.getElementById("vendorWalletAdjustModal");
const vendorWalletAdjustCloseBtn = document.getElementById("vendorWalletAdjustCloseBtn");
const vendorWalletAdjustForm = document.getElementById("vendorWalletAdjustForm");
const vendorWalletAdjustVendorName = document.getElementById("vendorWalletAdjustVendorName");
const vendorWalletAdjustCurrentBalance = document.getElementById("vendorWalletAdjustCurrentBalance");
const vendorWalletAdjustType = document.getElementById("vendorWalletAdjustType");
const vendorWalletAdjustAmount = document.getElementById("vendorWalletAdjustAmount");
const vendorWalletAdjustReason = document.getElementById("vendorWalletAdjustReason");
const vendorWalletAdjustSubmitBtn = document.getElementById("vendorWalletAdjustSubmitBtn");

if (vdAdjustWalletBtn) {
  vdAdjustWalletBtn.addEventListener("click", () => {
    if (!currentDetailVendor) return;
    vendorWalletAdjustForm.reset();
    vendorWalletAdjustVendorName.textContent = currentDetailVendor.shopName || "";
    vendorWalletAdjustCurrentBalance.textContent = `₹${Number(currentDetailVendor.walletBalance || 0).toLocaleString("en-IN")}`;
    openModal("vendorWalletAdjustModal");
  });
}

if (vendorWalletAdjustCloseBtn) {
  vendorWalletAdjustCloseBtn.addEventListener("click", () => closeModal("vendorWalletAdjustModal"));
}

if (vendorWalletAdjustForm) {
  vendorWalletAdjustForm.addEventListener("submit", async (e) => {

    e.preventDefault();

    if (!currentDetailVendor) return;

    const type = vendorWalletAdjustType.value;
    const amount = Number(vendorWalletAdjustAmount.value);
    const reason = vendorWalletAdjustReason.value.trim();

    if (!amount || amount <= 0) {
      showToast("Enter a valid amount", "danger");
      return;
    }

    vendorWalletAdjustSubmitBtn.disabled = true;
    vendorWalletAdjustSubmitBtn.textContent = "Saving...";

    try {

      const currentBalance = Number(currentDetailVendor.walletBalance || 0);
      const newBalance = type === "credit" ? currentBalance + amount : currentBalance - amount;

      await addDoc(collection(db, "vendorWalletTransactions"), {
        vendorId: currentDetailVendor.id,
        vendorName: currentDetailVendor.shopName || "Vendor",
        type,
        amount,
        reason,
        balanceAfter: newBalance,
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(db, "vendors", currentDetailVendor.id), {
        walletBalance: newBalance
      });

      await logAdminAction("Adjusted vendor wallet", "Vendors", {
        vendorId: currentDetailVendor.id, type, amount, reason
      });

      currentDetailVendor.walletBalance = newBalance;
      const idx = allVendors.findIndex(v => v.id === currentDetailVendor.id);
      if (idx !== -1) allVendors[idx].walletBalance = newBalance;

      vdWalletBalance.textContent = `₹${newBalance.toLocaleString("en-IN")}`;

      showToast("Wallet updated", "success");
      closeModal("vendorWalletAdjustModal");

      openVendorDetail(currentDetailVendor.id);

    } catch (error) {

      console.error("Vendor wallet adjust error:", error);
      showToast(error.message || "Failed to adjust wallet.", "danger");

    } finally {

      vendorWalletAdjustSubmitBtn.disabled = false;
      vendorWalletAdjustSubmitBtn.textContent = "Save Adjustment";

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

  loadVendors();

});
