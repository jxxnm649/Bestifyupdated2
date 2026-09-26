import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { showToast } from "./design-system.js";

const payoutForm = document.getElementById("payoutForm");
const payoutSaveBtn = document.getElementById("payoutSaveBtn");
const payoutDeleteBtn = document.getElementById("payoutDeleteBtn");

let currentUser = null;

onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  try {

    const userSnap = await getDoc(doc(db, "users", user.uid));
    const payout = userSnap.exists() ? (userSnap.data().payoutMethod || {}) : {};

    document.getElementById("payoutUpiId").value = payout.upiId || "";
    document.getElementById("payoutBankName").value = payout.bankAccountName || "";
    document.getElementById("payoutBankAccount").value = payout.bankAccountNumber || "";
    document.getElementById("payoutBankIFSC").value = payout.bankIFSC || "";

  } catch (error) {
    console.error("Load payout details error:", error);
  }

});

payoutForm.addEventListener("submit", async (e) => {

  e.preventDefault();
  if (!currentUser) return;

  payoutSaveBtn.disabled = true;
  payoutSaveBtn.textContent = "Saving...";

  try {

    await updateDoc(doc(db, "users", currentUser.uid), {
      payoutMethod: {
        upiId: document.getElementById("payoutUpiId").value.trim(),
        bankAccountName: document.getElementById("payoutBankName").value.trim(),
        bankAccountNumber: document.getElementById("payoutBankAccount").value.trim(),
        bankIFSC: document.getElementById("payoutBankIFSC").value.trim()
      }
    });

    showToast("Payout details saved", "success");

  } catch (error) {
    console.error("Save payout details error:", error);
    showToast(error.message || "Failed to save.", "danger");
  } finally {
    payoutSaveBtn.disabled = false;
    payoutSaveBtn.textContent = "Save Details";
  }

});

payoutDeleteBtn.addEventListener("click", async () => {

  if (!currentUser) return;

  const ok = window.confirm("Remove your saved bank/UPI details?");
  if (!ok) return;

  try {

    await updateDoc(doc(db, "users", currentUser.uid), {
      payoutMethod: { upiId: "", bankAccountName: "", bankAccountNumber: "", bankIFSC: "" }
    });

    payoutForm.reset();
    showToast("Payout details removed", "success");

  } catch (error) {
    console.error("Delete payout details error:", error);
    showToast(error.message || "Failed to remove.", "danger");
  }

});
