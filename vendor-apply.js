import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { showToast } from "./design-system.js";

const loadingState = document.getElementById("loadingState");
const statusState = document.getElementById("statusState");
const statusIcon = document.getElementById("statusIcon");
const statusTitle = document.getElementById("statusTitle");
const statusMessage = document.getElementById("statusMessage");
const form = document.getElementById("vendorApplyForm");
const submitBtn = document.getElementById("applySubmitBtn");

let currentUser = null;

function showStatusCard(status) {

  loadingState.style.display = "none";
  form.style.display = "none";
  statusState.style.display = "block";

  if (status === "Active") {
    statusIcon.textContent = "✅";
    statusTitle.textContent = "You're an Approved Supplier!";
    statusMessage.textContent = "Your application has already been approved. Head to your Vendor Dashboard to manage products and orders.";
    statusState.innerHTML += `<div style="text-align:center;margin-top:-8px;"><a href="vendor/dashboard.html" class="bf-btn bf-btn-primary" style="text-decoration:none;">Go to Vendor Dashboard →</a></div>`;
  } else if (status === "Blocked") {
    statusIcon.textContent = "🚫";
    statusTitle.textContent = "Application Blocked";
    statusMessage.textContent = "Your supplier account has been blocked. Please contact support for details.";
  } else {
    statusIcon.textContent = "⏳";
    statusTitle.textContent = "Application Pending";
    statusMessage.textContent = "Your application is under review. We'll notify you once it's approved.";
  }

}

async function init(user) {

  currentUser = user;

  try {

    const vendorSnap = await getDoc(doc(db, "vendors", user.uid));

    if (vendorSnap.exists()) {
      showStatusCard(vendorSnap.data().status || "Pending");
      return;
    }

    // No application yet -> show the form
    loadingState.style.display = "none";
    form.style.display = "block";

    if (user.email) {
      document.getElementById("vendorEmail").value = user.email;
    }

  } catch (error) {
    console.error("Vendor apply check error:", error);
    loadingState.textContent = "❌ Unable to check your account. Please try again.";
  }

}

form.addEventListener("submit", async (e) => {

  e.preventDefault();

  if (!currentUser) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting...";

  try {

    const vendorData = {
      userId: currentUser.uid,
      shopName: document.getElementById("shopName").value.trim(),
      ownerName: document.getElementById("ownerName").value.trim(),
      phone: document.getElementById("vendorPhone").value.trim(),
      email: document.getElementById("vendorEmail").value.trim(),
      category: document.getElementById("vendorCategory").value.trim(),
      address: document.getElementById("vendorAddress").value.trim(),
      commissionRate: 10,
      status: "Pending",
      createdAt: serverTimestamp()
    };

    // Doc ID = user's uid, so we can look it up directly and match it
    // against Firestore security rules (vendorId == request.auth.uid).
    await setDoc(doc(db, "vendors", currentUser.uid), vendorData);

    showToast("Application submitted! We'll review it shortly.", "success");
    showStatusCard("Pending");

  } catch (error) {

    console.error("Vendor apply submit error:", error);
    showToast(error.message || "Failed to submit application.", "danger");

  } finally {

    submitBtn.disabled = false;
    submitBtn.textContent = "Submit Application";

  }

});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  init(user);
});
