import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import {
  openModal,
  closeModal,
  showToast
} from "./design-system.js";

const addAddressBtn = document.getElementById("addAddressBtn");
const addressList = document.getElementById("addressList");
const addressModal = document.getElementById("addressModal");
const addressModalCloseBtn = document.getElementById("addressModalCloseBtn");
const addressModalTitle = document.getElementById("addressModalTitle");
const addressForm = document.getElementById("addressForm");
const addressSubmitBtn = document.getElementById("addressSubmitBtn");

let currentUser = null;
let editAddressId = null;
let allAddresses = [];

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function resetForm() {
  addressForm.reset();
  editAddressId = null;
  addressModalTitle.textContent = "Add Address";
  addressSubmitBtn.textContent = "Save Address";
}

addAddressBtn.addEventListener("click", () => {
  resetForm();
  openModal("addressModal");
});

addressModalCloseBtn.addEventListener("click", () => closeModal("addressModal"));

async function loadAddresses() {

  if (!currentUser) return;

  addressList.innerHTML = `<div class="bf-card" style="padding:16px;">Loading...</div>`;

  try {

    const snapshot = await getDocs(collection(db, "users", currentUser.uid, "addresses"));
    allAddresses = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    if (!allAddresses.length) {
      addressList.innerHTML = `<div class="bf-card" style="padding:16px;">No saved addresses yet. Add one!</div>`;
      return;
    }

    addressList.innerHTML = allAddresses.map(a => `
      <div class="bf-card" style="padding:14px;">
        <div style="font-weight:700;margin-bottom:4px;">${escapeHtml(a.label || "Address")}</div>
        <div style="font-size:13px;">${escapeHtml(a.name || "")} · ${escapeHtml(a.phone || "")}</div>
        <div style="font-size:13px;color:var(--ink-soft);margin-top:2px;">
          ${escapeHtml(a.line || "")}, ${escapeHtml(a.city || "")}, ${escapeHtml(a.state || "")} - ${escapeHtml(a.pincode || "")}
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;">
          <button type="button" class="bf-btn bf-btn-ghost bf-btn-sm edit-addr-btn" data-id="${escapeHtml(a.id)}" style="flex:1;">✏️ Edit</button>
          <button type="button" class="bf-btn bf-btn-ghost bf-btn-sm delete-addr-btn" data-id="${escapeHtml(a.id)}" style="flex:1;color:#c62828;">🗑️ Delete</button>
        </div>
      </div>
    `).join("");

  } catch (error) {
    console.error("Load addresses error:", error);
    addressList.innerHTML = `<div class="bf-card" style="padding:16px;">❌ Unable to load addresses.</div>`;
  }

}

addressForm.addEventListener("submit", async (e) => {

  e.preventDefault();
  if (!currentUser) return;

  const addressData = {
    label: document.getElementById("addrLabel").value.trim(),
    name: document.getElementById("addrName").value.trim(),
    phone: document.getElementById("addrPhone").value.trim(),
    line: document.getElementById("addrLine").value.trim(),
    city: document.getElementById("addrCity").value.trim(),
    state: document.getElementById("addrState").value.trim(),
    pincode: document.getElementById("addrPincode").value.trim()
  };

  addressSubmitBtn.disabled = true;
  addressSubmitBtn.textContent = "Saving...";

  try {

    if (editAddressId) {
      await updateDoc(doc(db, "users", currentUser.uid, "addresses", editAddressId), addressData);
      showToast("Address updated", "success");
    } else {
      await addDoc(collection(db, "users", currentUser.uid, "addresses"), addressData);
      showToast("Address added", "success");
    }

    closeModal("addressModal");
    resetForm();
    loadAddresses();

  } catch (error) {
    console.error("Save address error:", error);
    showToast(error.message || "Failed to save address.", "danger");
  } finally {
    addressSubmitBtn.disabled = false;
    addressSubmitBtn.textContent = "Save Address";
  }

});

addressList.addEventListener("click", async (e) => {

  const editBtn = e.target.closest(".edit-addr-btn");
  if (editBtn) {
    const addr = allAddresses.find(a => a.id === editBtn.dataset.id);
    if (!addr) return;

    document.getElementById("addrLabel").value = addr.label || "";
    document.getElementById("addrName").value = addr.name || "";
    document.getElementById("addrPhone").value = addr.phone || "";
    document.getElementById("addrLine").value = addr.line || "";
    document.getElementById("addrCity").value = addr.city || "";
    document.getElementById("addrState").value = addr.state || "";
    document.getElementById("addrPincode").value = addr.pincode || "";

    editAddressId = addr.id;
    addressModalTitle.textContent = "Edit Address";
    addressSubmitBtn.textContent = "Update Address";

    openModal("addressModal");
    return;
  }

  const deleteBtn = e.target.closest(".delete-addr-btn");
  if (deleteBtn) {

    const ok = window.confirm("Delete this address?");
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "users", currentUser.uid, "addresses", deleteBtn.dataset.id));
      allAddresses = allAddresses.filter(a => a.id !== deleteBtn.dataset.id);
      loadAddresses();
      showToast("Address deleted", "success");
    } catch (error) {
      console.error("Delete address error:", error);
      showToast(error.message || "Failed to delete address.", "danger");
    }

  }

});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  currentUser = user;
  loadAddresses();
});
