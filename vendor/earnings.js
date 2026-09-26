import { db } from "../firebase.js";

import {
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { guardVendorPage, wireLogout } from "./vendor-common.js";

wireLogout(document.getElementById("logoutBtn"));

const earningsList = document.getElementById("earningsList");
const walletList = document.getElementById("walletList");
const earningsFilters = document.getElementById("earningsFilters");
const statusFilter = document.getElementById("statusFilter");
const fromDate = document.getElementById("fromDate");
const toDate = document.getElementById("toDate");
const statTotal = document.getElementById("statTotal");
const statCollected = document.getElementById("statCollected");
const statPending = document.getElementById("statPending");
const statWallet = document.getElementById("statWallet");

let allEntries = [];
let allWalletTx = [];

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function toJsDate(ts) {
  if (!ts) return null;
  return ts?.toDate ? ts.toDate() : new Date(ts);
}

function formatDate(ts) {
  const d = toJsDate(ts);
  if (!d) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

async function loadEarnings(vendorId) {

  try {

    const snapshot = await getDocs(
      query(collection(db, "commissions"), where("vendorId", "==", vendorId))
    );

    allEntries = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (toJsDate(b.createdAt)?.getTime() || 0) - (toJsDate(a.createdAt)?.getTime() || 0));

    applyFilters();

  } catch (error) {
    console.error("Vendor earnings load error:", error);
    earningsList.innerHTML = `<div class="bf-card" style="padding:20px;">❌ Unable to load earnings.</div>`;
  }

}

async function loadWallet(vendor) {

  statWallet.textContent = `₹${Number(vendor.walletBalance || 0).toLocaleString("en-IN")}`;

  try {

    const snapshot = await getDocs(
      query(collection(db, "vendorWalletTransactions"), where("vendorId", "==", vendor.id))
    );

    allWalletTx = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (toJsDate(b.createdAt)?.getTime() || 0) - (toJsDate(a.createdAt)?.getTime() || 0));

    renderWallet();

  } catch (error) {
    console.error("Vendor wallet load error:", error);
    walletList.innerHTML = `<div class="bf-card" style="padding:20px;">❌ Unable to load wallet history.</div>`;
  }

}

function renderWallet() {

  if (!allWalletTx.length) {
    walletList.innerHTML = `<div class="bf-card" style="padding:20px;">No wallet activity yet.</div>`;
    return;
  }

  walletList.innerHTML = allWalletTx.map((t) => {
    const isCredit = t.type === "credit";
    return `
      <div class="bf-card" style="padding:14px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
        <div>
          <div style="font-weight:700;color:${isCredit ? "#2F7A4F" : "#c62828"};">
            ${isCredit ? "+" : "-"}₹${escapeHtml(String(t.amount ?? 0))}
          </div>
          <div style="font-size:12px;opacity:.65;margin-top:2px;">${escapeHtml(t.reason || "")} · ${formatDate(t.createdAt)}</div>
        </div>
        <div style="font-size:12px;opacity:.6;">Bal: ₹${escapeHtml(String(t.balanceAfter ?? 0))}</div>
      </div>
    `;
  }).join("");

}

document.querySelectorAll(".ve-tab").forEach((tabBtn) => {
  tabBtn.addEventListener("click", () => {

    document.querySelectorAll(".ve-tab").forEach(b => b.classList.remove("active"));
    tabBtn.classList.add("active");

    if (tabBtn.dataset.tab === "wallet") {
      earningsFilters.style.display = "none";
      earningsList.style.display = "none";
      walletList.style.display = "flex";
    } else {
      earningsFilters.style.display = "flex";
      earningsList.style.display = "flex";
      walletList.style.display = "none";
    }

  });
});

function applyFilters() {

  const status = statusFilter.value;
  const from = fromDate.value ? new Date(fromDate.value + "T00:00:00") : null;
  const to = toDate.value ? new Date(toDate.value + "T23:59:59") : null;

  const filtered = allEntries.filter((c) => {
    const entryStatus = c.status === "Collected" ? "Collected" : "Pending";
    const matchesStatus = status === "All" || entryStatus === status;

    const d = toJsDate(c.createdAt);
    const matchesFrom = !from || (d && d >= from);
    const matchesTo = !to || (d && d <= to);

    return matchesStatus && matchesFrom && matchesTo;
  });

  // A vendor's earnings are what they KEEP (vendorPayable), not the
  // commission Bestify deducts. These previously summed commissionAmount,
  // which displayed Bestify's cut to the vendor as if it were income.
  // Older hand-entered rows have no vendorPayable, so fall back to
  // orderAmount − commissionAmount for those.
  const payableOf = (c) => {
    if (c.vendorPayable != null) return Number(c.vendorPayable) || 0;
    return Math.max(0, Number(c.orderAmount || 0) - Number(c.commissionAmount || 0));
  };

  const total = allEntries.reduce((s, c) => s + payableOf(c), 0);
  const collected = allEntries.filter(c => c.status === "Collected").reduce((s, c) => s + payableOf(c), 0);
  const pending = total - collected;

  statTotal.textContent = `₹${total.toLocaleString("en-IN")}`;
  statCollected.textContent = `₹${collected.toLocaleString("en-IN")}`;
  statPending.textContent = `₹${pending.toLocaleString("en-IN")}`;

  if (!filtered.length) {
    earningsList.innerHTML = `<div class="bf-card" style="padding:20px;">No entries for this filter.</div>`;
    return;
  }

  earningsList.innerHTML = filtered.map((c) => {

    const isCollected = c.status === "Collected";

    return `
      <div class="bf-card" style="padding:14px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
        <div>
          <div style="font-weight:700;">You earn ₹${escapeHtml(String(payableOf(c)))}</div>
          <div style="font-size:12px;opacity:.65;margin-top:2px;">
            Order ₹${escapeHtml(String(c.orderAmount ?? 0))} − ${escapeHtml(String(c.commissionRate ?? 0))}% commission (₹${escapeHtml(String(c.commissionAmount ?? 0))}) · ${formatDate(c.createdAt)}
          </div>
          ${c.subOrderNumber ? `<div style="font-size:11.5px;opacity:.55;margin-top:2px;">#${escapeHtml(c.subOrderNumber)}</div>` : ""}
          ${c.note ? `<div style="font-size:12px;opacity:.6;margin-top:2px;">📝 ${escapeHtml(c.note)}</div>` : ""}
        </div>
        <span class="bf-status-pill ${isCollected ? "bf-status-success" : "bf-status-pending"}">${isCollected ? "Collected" : "Pending"}</span>
      </div>
    `;

  }).join("");

}

statusFilter.addEventListener("change", applyFilters);
fromDate.addEventListener("change", applyFilters);
toDate.addEventListener("change", applyFilters);

guardVendorPage((user, vendor) => {
  loadEarnings(user.uid);
  loadWallet(vendor);
});
