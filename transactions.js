import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const txnList = document.getElementById("txnList");
const currentBalanceEl = document.getElementById("currentBalance");
const totalInEl = document.getElementById("totalIn");
const totalOutEl = document.getElementById("totalOut");
const pendingCashbackCard = document.getElementById("pendingCashbackCard");
const pendingCashbackAmountEl = document.getElementById("pendingCashbackAmount");
const fromDate = document.getElementById("fromDate");
const toDate = document.getElementById("toDate");
const clearFiltersBtn = document.getElementById("clearFilters");
const txnSearch = document.getElementById("txnSearch");

let allTransactions = [];
let activeType = "all";

function toJsDate(ts) {
  if (!ts) return null;
  return ts?.toDate ? ts.toDate() : new Date(ts);
}

function formatDate(ts) {
  const d = toJsDate(ts);
  if (!d) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
    ", " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function renderTxnCard(txn) {
  const isCredit = txn.type === "credit";
  return `
    <div class="txn-card">
      <div class="txn-icon ${isCredit ? "credit" : "debit"}">
        ${isCredit ? "↓" : "↑"}
      </div>
      <div class="txn-body">
        <p class="txn-reason">${escapeHtml(txn.reason || (isCredit ? "Credit" : "Debit"))}</p>
        <p class="txn-date">${formatDate(txn.createdAt)}</p>
      </div>
      <div class="txn-amounts">
        <div class="txn-amount ${isCredit ? "credit" : "debit"}">
          ${isCredit ? "+" : "-"}₹${Number(txn.amount || 0).toLocaleString("en-IN")}
        </div>
        <div class="txn-balance-after">Bal: ₹${Number(txn.balanceAfter ?? 0).toLocaleString("en-IN")}</div>
      </div>
    </div>
  `;
}

function applyFilters() {

  const term = txnSearch.value.trim().toLowerCase();
  const from = fromDate.value ? new Date(fromDate.value + "T00:00:00") : null;
  const to = toDate.value ? new Date(toDate.value + "T23:59:59") : null;

  const filtered = allTransactions.filter((txn) => {

    const matchesType = activeType === "all" || txn.type === activeType;

    const matchesSearch = !term || (txn.reason || "").toLowerCase().includes(term);

    const txnDate = toJsDate(txn.createdAt);
    const matchesFrom = !from || (txnDate && txnDate >= from);
    const matchesTo = !to || (txnDate && txnDate <= to);

    return matchesType && matchesSearch && matchesFrom && matchesTo;

  });

  const totalIn = filtered.filter(t => t.type === "credit").reduce((s, t) => s + Number(t.amount || 0), 0);
  const totalOut = filtered.filter(t => t.type === "debit").reduce((s, t) => s + Number(t.amount || 0), 0);

  totalInEl.textContent = `₹${totalIn.toLocaleString("en-IN")}`;
  totalOutEl.textContent = `₹${totalOut.toLocaleString("en-IN")}`;

  if (filtered.length === 0) {
    txnList.innerHTML = `<div class="no-results">No transactions found for this filter 🧾</div>`;
    return;
  }

  txnList.innerHTML = filtered.map(renderTxnCard).join("");

}

const typeChips = document.getElementById("typeChips");

typeChips.addEventListener("click", (e) => {
  const chip = e.target.closest(".filter-chip");
  if (!chip) return;

  activeType = chip.dataset.type;
  [...typeChips.children].forEach(c => c.classList.toggle("active", c === chip));
  applyFilters();
});

fromDate.addEventListener("change", applyFilters);
toDate.addEventListener("change", applyFilters);
txnSearch.addEventListener("input", applyFilters);

clearFiltersBtn.addEventListener("click", () => {
  activeType = "all";
  fromDate.value = "";
  toDate.value = "";
  txnSearch.value = "";
  [...typeChips.children].forEach(c => c.classList.toggle("active", c.dataset.type === "all"));
  applyFilters();
});

async function loadTransactions(user) {

  txnList.innerHTML = `<div class="no-results">Loading...</div>`;

  try {

    const userSnap = await getDoc(doc(db, "users", user.uid));
    const balance = userSnap.exists() ? Number(userSnap.data().walletBalance || 0) : 0;
    currentBalanceEl.textContent = `₹${balance.toLocaleString("en-IN")}`;

    const pendingCashback = userSnap.exists() ? Number(userSnap.data().pendingCashbackBalance || 0) : 0;
    if (pendingCashback > 0) {
      pendingCashbackAmountEl.textContent = `₹${pendingCashback.toLocaleString("en-IN")}`;
      pendingCashbackCard.style.display = "block";
    }

    const q = query(
      collection(db, "walletTransactions"),
      where("userId", "==", user.uid)
    );

    const snapshot = await getDocs(q);

    allTransactions = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (toJsDate(b.createdAt)?.getTime() || 0) - (toJsDate(a.createdAt)?.getTime() || 0));

    if (allTransactions.length === 0) {
      txnList.innerHTML = `<div class="no-results">No transactions yet 🧾</div>`;
      totalInEl.textContent = "₹0";
      totalOutEl.textContent = "₹0";
      return;
    }

    applyFilters();

  } catch (error) {
    console.error("Transactions load error:", error);
    txnList.innerHTML = `<div class="no-results">❌ Unable to load transactions.</div>`;
  }

}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  loadTransactions(user);
});
