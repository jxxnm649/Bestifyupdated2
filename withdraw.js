import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-functions.js";

const functions = getFunctions();
const requestWithdrawal = httpsCallable(functions, "requestWithdrawal");

const currentBalanceEl = document.getElementById("currentBalance");
const withdrawForm = document.getElementById("withdrawForm");
const wdSubmitBtn = document.getElementById("wdSubmitBtn");
const wdMethod = document.getElementById("wdMethod");
const wdUpiFields = document.getElementById("wdUpiFields");
const wdBankFields = document.getElementById("wdBankFields");
const wdHistory = document.getElementById("wdHistory");

let currentUser = null;

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

async function loadBalance(uid) {
  const userSnap = await getDoc(doc(db, "users", uid));
  const data = userSnap.exists() ? userSnap.data() : {};
  const balance = Number(data.walletBalance || 0);
  currentBalanceEl.textContent = `₹${balance.toLocaleString("en-IN")}`;

  const payout = data.payoutMethod || {};
  if (payout.upiId) document.getElementById("wdUpiId").value = payout.upiId;
  if (payout.bankAccountName) document.getElementById("wdBankName").value = payout.bankAccountName;
  if (payout.bankAccountNumber) document.getElementById("wdBankAccount").value = payout.bankAccountNumber;
  if (payout.bankIFSC) document.getElementById("wdBankIFSC").value = payout.bankIFSC;
}

async function loadHistory(uid) {

  try {

    const snapshot = await getDocs(
      query(collection(db, "withdrawalRequests"), where("requesterId", "==", uid))
    );

    const requests = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return tb - ta;
      });

    if (!requests.length) {
      wdHistory.innerHTML = `<div class="wd-request-card">No withdrawal requests yet.</div>`;
      return;
    }

    wdHistory.innerHTML = requests.map(r => `
      <div class="wd-request-card">
        <div>
          <div class="wd-request-amount">₹${escapeHtml(String(r.amount ?? 0))}</div>
          <div class="wd-request-meta">${r.method === "upi" ? "UPI" : "Bank"} · ${formatDate(r.createdAt)}</div>
        </div>
        <span style="color:${statusColor(r.status)};font-weight:700;font-size:13px;">${escapeHtml(r.status || "Pending")}</span>
      </div>
    `).join("");

  } catch (error) {
    console.error("Withdrawal history load error:", error);
    wdHistory.innerHTML = `<div class="wd-request-card">❌ Unable to load history.</div>`;
  }

}

withdrawForm.addEventListener("submit", async (e) => {

  e.preventDefault();
  if (!currentUser) return;

  const amount = Number(document.getElementById("wdAmount").value);
  const method = wdMethod.value;

  const payload = {
    requesterType: "user",
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

    await requestWithdrawal(payload);

    alert("Withdrawal request submitted ✅");
    withdrawForm.reset();
    wdMethod.dispatchEvent(new Event("change"));

    await loadBalance(currentUser.uid);
    await loadHistory(currentUser.uid);

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

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  currentUser = user;
  loadBalance(user.uid);
  loadHistory(user.uid);
});
