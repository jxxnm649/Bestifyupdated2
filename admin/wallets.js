import { auth, db } from "../firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import {
  openModal,
  closeModal,
  showToast
} from "../design-system.js";

import { logAdminAction } from "./audit.js";


const walletsSummary = document.getElementById("walletsSummary");

const balancesTabBtn = document.getElementById("balancesTabBtn");
const transactionsTabBtn = document.getElementById("transactionsTabBtn");
const balancesPanel = document.getElementById("balancesPanel");
const transactionsPanel = document.getElementById("transactionsPanel");

const walletSearch = document.getElementById("walletSearch");
const walletsCount = document.getElementById("walletsCount");
const walletsList = document.getElementById("walletsList");

const transactionsCount = document.getElementById("transactionsCount");
const transactionsList = document.getElementById("transactionsList");

const walletAdjustModal = document.getElementById("walletAdjustModal");
const walletAdjustCloseBtn = document.getElementById("walletAdjustCloseBtn");
const walletAdjustForm = document.getElementById("walletAdjustForm");
const walletAdjustTitle = document.getElementById("walletAdjustTitle");
const walletAdjustCustomer = document.getElementById("walletAdjustCustomer");
const walletAdjustCurrentBalance = document.getElementById("walletAdjustCurrentBalance");
const walletAdjustType = document.getElementById("walletAdjustType");
const walletAdjustAmount = document.getElementById("walletAdjustAmount");
const walletAdjustReason = document.getElementById("walletAdjustReason");
const walletAdjustSubmitBtn = document.getElementById("walletAdjustSubmitBtn");

let allUsers = [];
let allTransactions = [];
let adjustUserId = null;


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
    if (isNaN(d.getTime())) return "Not available";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
      " · " +
      d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "Not available";
  }
}

function balanceOf(user) {
  const bal = Number(user.walletBalance);
  return isNaN(bal) ? 0 : bal;
}


/* =========================
   TABS
========================= */

function showBalancesTab() {
  balancesPanel.style.display = "";
  transactionsPanel.style.display = "none";
  balancesTabBtn.className = "bf-btn bf-btn-primary bf-btn-sm";
  transactionsTabBtn.className = "bf-btn bf-btn-ghost bf-btn-sm";
}

function showTransactionsTab() {
  balancesPanel.style.display = "none";
  transactionsPanel.style.display = "";
  transactionsTabBtn.className = "bf-btn bf-btn-primary bf-btn-sm";
  balancesTabBtn.className = "bf-btn bf-btn-ghost bf-btn-sm";
}

balancesTabBtn.addEventListener("click", showBalancesTab);
transactionsTabBtn.addEventListener("click", showTransactionsTab);


/* =========================
   LOAD DATA
========================= */

async function loadUsers() {

  try {

    const snapshot = await getDocs(collection(db, "users"));

    allUsers = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    renderSummary();
    renderWalletsList();

  } catch (error) {

    console.error("Users loading error:", error);

    walletsList.innerHTML = `
      <div class="bf-card" style="padding:20px;">
        ❌ Unable to load users.
      </div>
    `;

  }

}

async function loadTransactions() {

  try {

    let snapshot;

    try {
      snapshot = await getDocs(
        query(collection(db, "walletTransactions"), orderBy("createdAt", "desc"))
      );
    } catch {
      snapshot = await getDocs(collection(db, "walletTransactions"));
    }

    allTransactions = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    renderTransactionsList();

  } catch (error) {

    console.error("Transactions loading error:", error);

    transactionsList.innerHTML = `
      <div class="bf-card" style="padding:20px;">
        ❌ Unable to load transactions.
      </div>
    `;

  }

}


/* =========================
   SUMMARY
========================= */

function renderSummary() {

  const totalBalance = allUsers.reduce((sum, u) => sum + balanceOf(u), 0);
  const usersWithBalance = allUsers.filter(u => balanceOf(u) > 0).length;

  walletsSummary.innerHTML = `

    <div class="bf-card" style="padding:12px 16px;">
      <div style="font-size:12px; opacity:.65;">Total Wallet Balance</div>
      <div style="font-size:18px; font-weight:700;">₹${totalBalance.toLocaleString("en-IN")}</div>
    </div>

    <div class="bf-card" style="padding:12px 16px;">
      <div style="font-size:12px; opacity:.65;">Users With Balance</div>
      <div style="font-size:18px; font-weight:700;">${usersWithBalance}</div>
    </div>

  `;

}


/* =========================
   BALANCES LIST
========================= */

function getFilteredUsers() {

  const term = walletSearch.value.trim().toLowerCase();

  if (!term) return allUsers;

  return allUsers.filter((user) => {
    const name = (user.name || user.fullName || user.displayName || "").toLowerCase();
    const email = (user.email || "").toLowerCase();
    const phone = (user.phone || user.mobile || "").toLowerCase();
    return name.includes(term) || email.includes(term) || phone.includes(term);
  });

}

function renderWalletsList() {

  const filtered = getFilteredUsers();

  walletsCount.textContent = `Total Users: ${allUsers.length}`;

  if (!filtered.length) {
    walletsList.innerHTML = `
      <div class="bf-card" style="padding:20px;">
        No users found.
      </div>
    `;
    return;
  }

  walletsList.innerHTML = filtered.map((user) => {

    const name = user.name || user.fullName || user.displayName || "Unnamed customer";
    const balance = balanceOf(user);

    return `
      <div class="bf-card" style="padding:16px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">

        <div>
          <div style="font-weight:700;">
            ${escapeHtml(name)}
          </div>

          <div style="font-size:13px; opacity:.7; margin-top:2px;">
            ${escapeHtml(user.email || user.phone || user.mobile || "")}
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:12px;">

          <div style="font-size:16px; font-weight:700;">
            ₹${balance.toLocaleString("en-IN")}
          </div>

          <button
            type="button"
            class="bf-btn bf-btn-ghost bf-btn-sm adjust-wallet-btn"
            data-id="${escapeHtml(user.id)}">
            Credit / Debit
          </button>

        </div>

      </div>
    `;

  }).join("");

}

if (walletSearch) walletSearch.addEventListener("input", renderWalletsList);

if (walletsList) {
  walletsList.addEventListener("click", (e) => {

    const btn = e.target.closest(".adjust-wallet-btn");
    if (!btn) return;

    openAdjustModal(btn.dataset.id);

  });
}


/* =========================
   CREDIT / DEBIT MODAL
========================= */

function openAdjustModal(userId) {

  const user = allUsers.find(u => u.id === userId);
  if (!user) return;

  adjustUserId = userId;

  const name = user.name || user.fullName || user.displayName || "Unnamed customer";

  walletAdjustTitle.textContent = "Adjust Wallet";
  walletAdjustCustomer.value = name;
  walletAdjustCurrentBalance.value = `₹${balanceOf(user).toLocaleString("en-IN")}`;
  walletAdjustType.value = "credit";
  walletAdjustAmount.value = "";
  walletAdjustReason.value = "";

  openModal("walletAdjustModal");

}

if (walletAdjustCloseBtn) {
  walletAdjustCloseBtn.addEventListener("click", () => {
    closeModal("walletAdjustModal");
  });
}

walletAdjustForm.addEventListener("submit", async (e) => {

  e.preventDefault();

  if (!adjustUserId) return;

  const user = allUsers.find(u => u.id === adjustUserId);
  if (!user) return;

  const type = walletAdjustType.value;
  const amount = Number(walletAdjustAmount.value) || 0;
  const reason = walletAdjustReason.value.trim();

  if (amount <= 0) {
    showToast("Enter a valid amount", "danger");
    return;
  }

  const currentBalance = balanceOf(user);

  if (type === "debit" && amount > currentBalance) {
    showToast("Debit amount exceeds current balance", "danger");
    return;
  }

  const newBalance = type === "credit"
    ? currentBalance + amount
    : currentBalance - amount;

  walletAdjustSubmitBtn.disabled = true;
  walletAdjustSubmitBtn.textContent = "Processing...";

  try {

    await updateDoc(doc(db, "users", adjustUserId), { walletBalance: newBalance });

    await addDoc(collection(db, "walletTransactions"), {
      userId: adjustUserId,
      customerName: user.name || user.fullName || user.displayName || "Customer",
      type,
      amount,
      reason,
      balanceAfter: newBalance,
      createdAt: serverTimestamp()
    });

    await logAdminAction(
      type === "credit" ? "Credited wallet" : "Debited wallet",
      "Wallets",
      { userId: adjustUserId, amount, reason }
    );

    const idx = allUsers.findIndex(u => u.id === adjustUserId);
    if (idx !== -1) {
      allUsers[idx] = { ...allUsers[idx], walletBalance: newBalance };
    }

    renderSummary();
    renderWalletsList();
    closeModal("walletAdjustModal");
    showToast(type === "credit" ? "Wallet credited" : "Wallet debited", "success");

    adjustUserId = null;
    loadTransactions();

  } catch (error) {

    console.error("Wallet adjust error:", error);
    showToast(error.message || "Failed to update wallet.", "danger");

  } finally {

    walletAdjustSubmitBtn.disabled = false;
    walletAdjustSubmitBtn.textContent = "Confirm";

  }

});


/* =========================
   TRANSACTIONS LIST
========================= */

function renderTransactionsList() {

  transactionsCount.textContent = `Total Transactions: ${allTransactions.length}`;

  if (!allTransactions.length) {
    transactionsList.innerHTML = `
      <div class="bf-card" style="padding:20px;">
        No wallet transactions yet.
      </div>
    `;
    return;
  }

  transactionsList.innerHTML = allTransactions.map((txn) => {

    const isCredit = txn.type === "credit";

    return `
      <div class="bf-card" style="padding:16px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">

        <div>
          <div style="font-weight:700;">
            ${escapeHtml(txn.customerName || "Customer")}
          </div>

          ${txn.reason ? `
            <div style="font-size:13px; opacity:.7; margin-top:2px;">
              ${escapeHtml(txn.reason)}
            </div>
          ` : ""}

          <div style="font-size:12px; opacity:.55; margin-top:2px;">
            ${formatDate(txn.createdAt)} · Balance after: ₹${escapeHtml(String(txn.balanceAfter ?? ""))}
          </div>
        </div>

        <div style="font-size:16px; font-weight:700; color:${isCredit ? "#2e7d32" : "#c62828"};">
          ${isCredit ? "+" : "-"}₹${escapeHtml(String(txn.amount ?? 0))}
        </div>

      </div>
    `;

  }).join("");

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

  loadUsers();
  loadTransactions();

});
