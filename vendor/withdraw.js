import { db } from "../firebase.js";

import {
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-functions.js";

import { guardVendorPage, wireLogout } from "./vendor-common.js";

wireLogout(document.getElementById("logoutBtn"));

const functions = getFunctions();
const requestWithdrawal = httpsCallable(functions, "requestWithdrawal");

const currentBalanceEl = document.getElementById("currentBalance");
const withdrawForm = document.getElementById("withdrawForm");
const wdSubmitBtn = document.getElementById("wdSubmitBtn");
const wdMethod = document.getElementById("wdMethod");
const wdUpiFields = document.getElementById("wdUpiFields");
const wdBankFields = document.getElementById("wdBankFields");
const wdHistory = document.getElementById("wdHistory");

let currentVendorId = null;

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function formatDate(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

function statusColor(status) {
  if (status === "Approved") return "#2F7A4F";
  if (status === "Rejected") return "#c62828";
  return "#D98925";
}

wdMethod.addEventListener("change", () => {
  const isUpi = wdMethod.value === "upi";
  wdUpiFields.style.display = isUpi ? "block" : "none";
  wdBankFields.style.display = isUpi ? "none" : "block";
});

async function loadHistory(vendorId) {

  try {

    const snapshot = await getDocs(
      query(collection(db, "withdrawalRequests"), where("requesterId", "==", vendorId))
    );

    const requests = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return tb - ta;
      });

    if (!requests.length) {
      wdHistory.innerHTML = `<div class="bf-card" style="padding:14px;">No withdrawal requests yet.</div>`;
      return;
    }

    wdHistory.innerHTML = requests.map(r => `
      <div class="bf-card" style="padding:14px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-weight:700;">₹${escapeHtml(String(r.amount ?? 0))}</div>
          <div style="font-size:12px;opacity:.65;">${r.method === "upi" ? "UPI" : "Bank"} · ${formatDate(r.createdAt)}</div>
        </div>
        <span style="color:${statusColor(r.status)};font-weight:700;font-size:13px;">${escapeHtml(r.status || "Pending")}</span>
      </div>
    `).join("");

  } catch (error) {
    console.error("Withdrawal history load error:", error);
    wdHistory.innerHTML = `<div class="bf-card" style="padding:14px;">❌ Unable to load history.</div>`;
  }

}

withdrawForm.addEventListener("submit", async (e) => {

  e.preventDefault();
  if (!currentVendorId) return;

  const amount = Number(document.getElementById("wdAmount").value);
  const method = wdMethod.value;

  const payload = {
    requesterType: "vendor",
    amount,
    method
  };

  if (method === "upi") {
    payload.upiId = document.getElementById("wdUpiId").value.trim();
  } else {
    payload.bankAccountName = document.getElementById("wdBankName").value.trim();
    payload.bankAccountNumber = document.getElementById("wdBankAccount").value.trim();
    payload.bankIFSC = document.getElementById("wdBankIFSC").value.trim();
  }

  wdSubmitBtn.disabled = true;
  wdSubmitBtn.textContent = "Submitting...";

  try {

    const result = await requestWithdrawal(payload);

    alert("Withdrawal request submitted ✅");
    withdrawForm.reset();
    wdMethod.dispatchEvent(new Event("change"));

    currentBalanceEl.textContent = `₹${Number(result.data.newBalance || 0).toLocaleString("en-IN")}`;
    await loadHistory(currentVendorId);

  } catch (error) {
    console.error("Withdrawal request error:", error);
    const friendly = (error.code === "functions/internal" || error.code === "functions/not-found" || /internal/i.test(error.message || ""))
      ? "Something went wrong on our end. Please try again in a moment, or contact support if this keeps happening."
      : (error.message || "Failed to submit withdrawal request.");
    alert(friendly);
  } finally {
    wdSubmitBtn.disabled = false;
    wdSubmitBtn.textContent = "Request Withdrawal";
  }

});

guardVendorPage((user, vendor) => {
  currentVendorId = user.uid;
  currentBalanceEl.textContent = `₹${Number(vendor.walletBalance || 0).toLocaleString("en-IN")}`;
  loadHistory(user.uid);
});
