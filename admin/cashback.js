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
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import {
  openModal,
  closeModal,
  showToast
} from "../design-system.js";

import { logAdminAction } from "./audit.js";


const cashbackSummary = document.getElementById("cashbackSummary");
const addCashbackBtn = document.getElementById("addCashbackBtn");
const cashbackSearch = document.getElementById("cashbackSearch");
const cashbackStatusFilter = document.getElementById("cashbackStatusFilter");
const cashbackCount = document.getElementById("cashbackCount");
const cashbackList = document.getElementById("cashbackList");

const cashbackFormModal = document.getElementById("cashbackFormModal");
const cashbackFormCloseBtn = document.getElementById("cashbackFormCloseBtn");
const cashbackForm = document.getElementById("cashbackForm");
const cashbackFormSubmitBtn = document.getElementById("cashbackFormSubmitBtn");
const cashbackUserSelect = document.getElementById("cashbackUserSelect");
const cashbackOrderAmount = document.getElementById("cashbackOrderAmount");
const cashbackPercent = document.getElementById("cashbackPercent");
const cashbackAmount = document.getElementById("cashbackAmount");
const cashbackNote = document.getElementById("cashbackNote");

let allUsers = [];
let allCashback = [];


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
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "Not available";
  }
}

function statusPillClass(status) {
  return status === "Credited" ? "bf-status-success" : "bf-status-pending";
}

function balanceOf(user) {
  const bal = Number(user?.walletBalance);
  return isNaN(bal) ? 0 : bal;
}

function computeCashback() {
  const orderAmount = Number(cashbackOrderAmount.value) || 0;
  const percent = Number(cashbackPercent.value) || 0;
  const amount = (orderAmount * percent) / 100;
  if (orderAmount > 0 && percent > 0) {
    cashbackAmount.value = amount.toFixed(2);
  }
}


/* =========================
   LOAD DATA
========================= */

async function loadUsers() {

  const snapshot = await getDocs(collection(db, "users"));

  allUsers = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));

  cashbackUserSelect.innerHTML =
    `<option value="">Select a user...</option>` +
    allUsers.map((u) => {
      const name = u.name || u.fullName || u.displayName || u.email || "Unnamed user";
      return `<option value="${escapeHtml(u.id)}">${escapeHtml(name)}</option>`;
    }).join("");

}

async function loadCashback() {

  try {

    let snapshot;

    try {
      snapshot = await getDocs(
        query(collection(db, "cashback"), orderBy("createdAt", "desc"))
      );
    } catch {
      snapshot = await getDocs(collection(db, "cashback"));
    }

    allCashback = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    renderSummary();
    renderCashbackList();

  } catch (error) {

    console.error("Cashback loading error:", error);

    cashbackList.innerHTML = `
      <div class="bf-card" style="padding:20px;">
        ❌ Unable to load cashback entries.
      </div>
    `;

  }

}


/* =========================
   SUMMARY
========================= */

function renderSummary() {

  const total = allCashback.length;
  const pending = allCashback.filter(c => c.status !== "Credited").length;
  const credited = allCashback.filter(c => c.status === "Credited").length;

  const totalCredited = allCashback
    .filter(c => c.status === "Credited")
    .reduce((sum, c) => sum + Number(c.cashbackAmount || 0), 0);

  cashbackSummary.innerHTML = `

    <div class="bf-card" style="padding:12px 16px;">
      <div style="font-size:12px; opacity:.65;">Total Entries</div>
      <div style="font-size:18px; font-weight:700;">${total}</div>
    </div>

    <div class="bf-card" style="padding:12px 16px;">
      <div style="font-size:12px; opacity:.65;">Pending</div>
      <div style="font-size:18px; font-weight:700;">${pending}</div>
    </div>

    <div class="bf-card" style="padding:12px 16px;">
      <div style="font-size:12px; opacity:.65;">Credited</div>
      <div style="font-size:18px; font-weight:700;">${credited}</div>
    </div>

    <div class="bf-card" style="padding:12px 16px;">
      <div style="font-size:12px; opacity:.65;">Total Cashback Given</div>
      <div style="font-size:18px; font-weight:700;">₹${totalCredited.toLocaleString("en-IN")}</div>
    </div>

  `;

}


/* =========================
   ADD CASHBACK MODAL
========================= */

if (addCashbackBtn) {
  addCashbackBtn.addEventListener("click", () => {
    cashbackForm.reset();
    cashbackPercent.value = 5;
    cashbackAmount.value = "0.00";
    openModal("cashbackFormModal");
  });
}

if (cashbackFormCloseBtn) {
  cashbackFormCloseBtn.addEventListener("click", () => {
    closeModal("cashbackFormModal");
  });
}

if (cashbackOrderAmount) cashbackOrderAmount.addEventListener("input", computeCashback);
if (cashbackPercent) cashbackPercent.addEventListener("input", computeCashback);

cashbackForm.addEventListener("submit", async (e) => {

  e.preventDefault();

  const userId = cashbackUserSelect.value;
  const user = allUsers.find(u => u.id === userId);

  if (!user) {
    showToast("Select a valid user", "danger");
    return;
  }

  const amount = Number(cashbackAmount.value) || 0;

  if (amount <= 0) {
    showToast("Cashback amount must be greater than 0", "danger");
    return;
  }

  cashbackFormSubmitBtn.disabled = true;
  cashbackFormSubmitBtn.textContent = "Saving...";

  try {

    await addDoc(collection(db, "cashback"), {
      userId,
      customerName: user.name || user.fullName || user.displayName || user.email || "Customer",
      orderAmount: Number(cashbackOrderAmount.value) || 0,
      cashbackPercent: Number(cashbackPercent.value) || 0,
      cashbackAmount: amount,
      note: cashbackNote.value.trim(),
      status: "Pending",
      createdAt: serverTimestamp()
    });

    await logAdminAction("Added cashback entry", "Cashback", { userId, amount });

    showToast("Cashback entry added", "success");
    closeModal("cashbackFormModal");
    cashbackForm.reset();
    loadCashback();

  } catch (error) {

    console.error("Cashback save error:", error);
    showToast(error.message || "Failed to save cashback entry.", "danger");

  } finally {

    cashbackFormSubmitBtn.disabled = false;
    cashbackFormSubmitBtn.textContent = "Save Cashback";

  }

});


/* =========================
   CASHBACK LIST
========================= */

function getFilteredCashback() {

  const term = cashbackSearch.value.trim().toLowerCase();
  const statusFilter = cashbackStatusFilter.value;

  return allCashback.filter((c) => {

    const name = (c.customerName || "").toLowerCase();
    const status = c.status === "Credited" ? "Credited" : "Pending";

    const matchesTerm = !term || name.includes(term);
    const matchesStatus = statusFilter === "All" || status === statusFilter;

    return matchesTerm && matchesStatus;

  });

}

function renderCashbackList() {

  const filtered = getFilteredCashback();

  cashbackCount.textContent = `Total Entries: ${allCashback.length}`;

  if (!filtered.length) {
    cashbackList.innerHTML = `
      <div class="bf-card" style="padding:20px;">
        No cashback entries found.
      </div>
    `;
    return;
  }

  cashbackList.innerHTML = filtered.map((c) => {

    const status = c.status === "Credited" ? "Credited" : "Pending";

    return `
      <div class="bf-card" style="padding:16px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">

        <div>
          <div style="font-weight:700;">
            ${escapeHtml(c.customerName || "Customer")}
          </div>

          <div style="font-size:13px; opacity:.7; margin-top:2px;">
            ${c.orderAmount ? "Order: ₹" + escapeHtml(String(c.orderAmount)) + " · " : ""}Cashback: ₹${escapeHtml(String(c.cashbackAmount ?? 0))}
          </div>

          ${c.note ? `
            <div style="font-size:12px; opacity:.6; margin-top:2px;">
              📝 ${escapeHtml(c.note)}
            </div>
          ` : ""}

          <div style="font-size:12px; opacity:.55; margin-top:2px;">
            ${formatDate(c.createdAt)}
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:10px;">

          <span class="bf-status-pill ${statusPillClass(status)}">
            ${status}
          </span>

          ${status === "Pending" ? `
            <button
              type="button"
              class="bf-btn bf-btn-ghost bf-btn-sm mark-credited-btn"
              data-id="${escapeHtml(c.id)}">
              Mark Credited
            </button>
          ` : ""}

          <button
            type="button"
            class="bf-btn bf-btn-ghost bf-btn-sm delete-cashback-btn"
            data-id="${escapeHtml(c.id)}"
            style="color:#c62828;">
            🗑️
          </button>

        </div>

      </div>
    `;

  }).join("");

}

if (cashbackSearch) cashbackSearch.addEventListener("input", renderCashbackList);
if (cashbackStatusFilter) cashbackStatusFilter.addEventListener("change", renderCashbackList);

if (cashbackList) {
  cashbackList.addEventListener("click", (e) => {

    const markBtn = e.target.closest(".mark-credited-btn");
    if (markBtn) {
      markCredited(markBtn.dataset.id);
      return;
    }

    const deleteBtn = e.target.closest(".delete-cashback-btn");
    if (deleteBtn) {
      deleteCashback(deleteBtn.dataset.id);
    }

  });
}


/* =========================
   MARK CREDITED (credits user's wallet)
========================= */

async function markCredited(cashbackId) {

  const entry = allCashback.find(c => c.id === cashbackId);
  if (!entry) return;

  const ok = window.confirm(
    `Credit ₹${entry.cashbackAmount || 0} cashback to ${entry.customerName || "this user"}'s wallet?`
  );
  if (!ok) return;

  try {

    const userRef = doc(db, "users", entry.userId);
    const userSnap = await getDoc(userRef);

    const currentBalance = userSnap.exists() ? balanceOf(userSnap.data()) : 0;
    const cashbackAmountValue = Number(entry.cashbackAmount) || 0;
    const newBalance = currentBalance + cashbackAmountValue;

    await updateDoc(userRef, { walletBalance: newBalance });

    await addDoc(collection(db, "walletTransactions"), {
      userId: entry.userId,
      customerName: entry.customerName || "Customer",
      type: "credit",
      amount: cashbackAmountValue,
      reason: entry.note ? `Cashback: ${entry.note}` : "Cashback credited",
      balanceAfter: newBalance,
      createdAt: serverTimestamp()
    });

    await updateDoc(doc(db, "cashback", cashbackId), {
      status: "Credited",
      creditedAt: serverTimestamp()
    });

    await logAdminAction("Credited cashback to wallet", "Cashback", {
      cashbackId,
      userId: entry.userId,
      amount: cashbackAmountValue
    });

    const idx = allCashback.findIndex(c => c.id === cashbackId);
    if (idx !== -1) {
      allCashback[idx] = { ...allCashback[idx], status: "Credited" };
    }

    renderSummary();
    renderCashbackList();
    showToast("Cashback credited to wallet", "success");

  } catch (error) {

    console.error("Mark credited error:", error);
    showToast(error.message || "Failed to process cashback.", "danger");

  }

}


/* =========================
   DELETE
========================= */

async function deleteCashback(cashbackId) {

  const ok = window.confirm("Delete this cashback entry? This cannot be undone.");
  if (!ok) return;

  try {

    await deleteDoc(doc(db, "cashback", cashbackId));

    await logAdminAction("Deleted cashback entry", "Cashback", { cashbackId });

    allCashback = allCashback.filter(c => c.id !== cashbackId);

    renderSummary();
    renderCashbackList();
    showToast("Cashback entry deleted", "success");

  } catch (error) {

    console.error("Delete cashback error:", error);
    showToast(error.message || "Failed to delete cashback entry.", "danger");

  }

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

  await loadUsers();
  loadCashback();

});
