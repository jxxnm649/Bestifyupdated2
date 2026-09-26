import { db } from "../firebase.js";

import {
  doc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { showToast } from "../design-system.js";
import { guardVendorPage, wireLogout } from "./vendor-common.js";

wireLogout(document.getElementById("logoutBtn"));

const form = document.getElementById("profileForm");
const saveBtn = document.getElementById("saveProfileBtn");

let currentVendorId = null;

guardVendorPage((user, vendor) => {

  currentVendorId = user.uid;

  document.getElementById("shopName").value = vendor.shopName || "";
  document.getElementById("ownerName").value = vendor.ownerName || "";
  document.getElementById("vendorPhone").value = vendor.phone || "";
  document.getElementById("vendorEmail").value = vendor.email || "";
  document.getElementById("vendorCategory").value = vendor.category || "";
  document.getElementById("vendorAddress").value = vendor.address || "";

  document.getElementById("commissionRateLabel").textContent = `${vendor.commissionRate ?? 0}%`;
  document.getElementById("statusLabel").textContent = vendor.status || "Active";

});

form.addEventListener("submit", async (e) => {

  e.preventDefault();

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  try {

    // Only shop-detail fields — status & commissionRate stay admin-controlled.
    await updateDoc(doc(db, "vendors", currentVendorId), {
      shopName: document.getElementById("shopName").value.trim(),
      ownerName: document.getElementById("ownerName").value.trim(),
      phone: document.getElementById("vendorPhone").value.trim(),
      email: document.getElementById("vendorEmail").value.trim(),
      category: document.getElementById("vendorCategory").value.trim(),
      address: document.getElementById("vendorAddress").value.trim()
    });

    showToast("Profile updated", "success");

  } catch (error) {
    console.error("Vendor profile save error:", error);
    showToast(error.message || "Failed to update profile.", "danger");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Changes";
  }

});
