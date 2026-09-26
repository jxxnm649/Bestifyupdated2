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


const referralsSummary = document.getElementById("referralsSummary");
const addReferralBtn = document.getElementById("addReferralBtn");
const referralSearch = document.getElementById("referralSearch");
const referralStatusFilter = document.getElementById("referralStatusFilter");
const referralCount = document.getElementById("referralCount");
const referralsList = document.getElementById("referralsList");

const referralFormModal = document.getElementById("referralFormModal");
const referralFormCloseBtn = document.getElementById("referralFormCloseBtn");
const referralForm = document.getElementById("referralForm");
const referralFormSubmitBtn = document.getElementById("referralFormSubmitBtn");
const referrerSelect = document.getElementById("referrerSelect");
const referredName = document.getElementById("referredName");
const referredContact = document.getElementById("referredContact");
const referralRewardAmount = document.getElementById("referralRewardAmount");

let allUsers = [];
let allReferrals = [];


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

function balanceOf(user) {
  const bal = Number(user?.walletBalance);
  return isNaN(bal) ? 0 : bal;
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

  referrerSelect.innerHTML =
    `<option value="">Select a user...</option>` +
    allUsers.map((u) => {
      const name = u.name || u.fullName || u.displayName || u.email || "Unnamed user";
      return `<option value="${escapeHtml(u.id)}">${escapeHtml(name)}</option>`;
    }).join("");

}

async function loadReferrals() {

  try {

    let snapshot;

    try {
      snapshot = await getDocs(
        query(collection(db, "referrals"), orderBy("createdAt", "desc"))
      );
    } catch {
      snapshot = await getDocs(collection(db, "referrals"));
    }

    allReferrals = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    renderSummary();
    renderReferralsList();

  } catch (error) {

    console.error("Referrals loading error:", error);

    referralsList.innerHTML = `
      <div class="bf-card" style="padding:20px;">
        ❌ Unable to load referrals.
      </div>
    `;

  }

}


/* =========================
   SUMMARY
========================= */

function renderSummary() {

  const total = allReferrals.length;
  const pending = allReferrals.filter(r => r.status !== "Rewarded").length;
  const rewarded = allReferrals.filter(r => r.status === "Rewarded").length;
  const totalRewarded = allReferrals
    .filter(r => r.status === "Rewarded")
    .reduce((sum, r) => sum + Number(r.rewardAmount || 0), 0);

  referralsSummary.innerHTML = `

    <div class="bf-card" style="padding:12px 16px;">
      <div style="font-size:12px; opacity:.65;">Total Referrals</div>
      <div style="font-size:18px; font-weight:700;">${total}</div>
    </div>

    <div class="bf-card" style="padding:12px 16px;">
      <div style="font-size:12px; opacity:.65;">Pending Rewards</div>
      <div style="font-size:18px; font-weight:700;">${pending}</div>
    </div>

    <div class="bf-card" style="padding:12px 16px;">
      <div style="font-size:12px; opacity:.65;">Rewarded</div>
      <div style="font-size:18px; font-weight:700;">${rewarded}</div>
    </div>

    <div class="bf-card" style="padding:12px 16px;">
      <div style="font-size:12px; opacity:.65;">Total Paid Out</div>
      <div style="font-size:18px; font-weight:700;">₹${totalRewarded.toLocaleString("en-IN")}</div>
    </div>

  `;

}


/* =========================
   ADD REFERRAL MODAL
========================= */

if (addReferralBtn) {
  addReferralBtn.addEventListener("click", () => {
    referralForm.reset();
    referralRewardAmount.value = 50;
    openModal("referralFormModal");
  });
}

if (referralFormCloseBtn) {
  referralFormCloseBtn.addEventListener("click", () => {
    closeModal("referralFormModal");
  });
}

referralForm.addEventListener("submit", async (e) => {

  e.preventDefault();

  const referrerId = referrerSelect.value;
  const referrer = allUsers.find(u => u.id === referrerId);

  if (!referrer) {
    showToast("Select a valid referrer", "danger");
    return;
  }

  referralFormSubmitBtn.disabled = true;
  referralFormSubmitBtn.textContent = "Saving...";

  try {

    await addDoc(collection(db, "referrals"), {
      referrerId,
      referrerName: referrer.name || referrer.fullName || referrer.displayName || referrer.email || "Customer",
      referredName: referredName.value.trim(),
      referredContact: referredContact.value.trim(),
      rewardAmount: Number(referralRewardAmount.value) || 0,
      status: "Pending",
      createdAt: serverTimestamp()
    });

    await logAdminAction("Added referral", "Referrals", { referrerId });

    showToast("Referral added", "success");
    closeModal("referralFormModal");
    referralForm.reset();
    loadReferrals();

  } catch (error) {

    console.error("Referral save error:", error);
    showToast(error.message || "Failed to save referral.", "danger");

  } finally {

    referralFormSubmitBtn.disabled = false;
    referralFormSubmitBtn.textContent = "Save Referral";

  }

});


/* =========================
   REFERRALS LIST
========================= */

function getFilteredReferrals() {

  const term = referralSearch.value.trim().toLowerCase();
  const statusFilter = referralStatusFilter.value;

  return allReferrals.filter((r) => {

    const referrer = (r.referrerName || "").toLowerCase();
    const referred = (r.referredName || "").toLowerCase();
    const status = r.status === "Rewarded" ? "Rewarded" : "Pending";

    const matchesTerm = !term || referrer.includes(term) || referred.includes(term);
    const matchesStatus = statusFilter === "All" || status === statusFilter;

    return matchesTerm && matchesStatus;

  });

}

function renderReferralsList() {

  const filtered = getFilteredReferrals();

  referralCount.textContent = `Total Referrals: ${allReferrals.length}`;

  if (!filtered.length) {
    referralsList.innerHTML = `
      <div class="bf-card" style="padding:20px;">
        No referrals found.
      </div>
    `;
    return;
  }

  referralsList.innerHTML = filtered.map((r) => {

    const status = r.status === "Rewarded" ? "Rewarded" : "Pending";

    return `
      <div class="bf-card" style="padding:16px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">

        <div>
          <div style="font-weight:700;">
            ${escapeHtml(r.referrerName || "Customer")} → ${escapeHtml(r.referredName || "Unknown")}
          </div>

          <div style="font-size:13px; opacity:.7; margin-top:2px;">
            ${r.referredContact ? escapeHtml(r.referredContact) + " · " : ""}Reward: ₹${escapeHtml(String(r.rewardAmount ?? 0))}
          </div>

          <div style="font-size:12px; opacity:.55; margin-top:2px;">
            ${formatDate(r.createdAt)}
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:10px;">

          <span class="bf-status-pill ${status === "Rewarded" ? "bf-status-success" : "bf-status-pending"}">
            ${status}
          </span>

          ${status === "Pending" ? `
            <button
              type="button"
              class="bf-btn bf-btn-ghost bf-btn-sm mark-rewarded-btn"
              data-id="${escapeHtml(r.id)}">
              Mark Rewarded
            </button>
          ` : ""}

        </div>

      </div>
    `;

  }).join("");

}

if (referralSearch) referralSearch.addEventListener("input", renderReferralsList);
if (referralStatusFilter) referralStatusFilter.addEventListener("change", renderReferralsList);

if (referralsList) {
  referralsList.addEventListener("click", (e) => {

    const btn = e.target.closest(".mark-rewarded-btn");
    if (!btn) return;

    markRewarded(btn.dataset.id);

  });
}


/* =========================
   MARK REWARDED (credits referrer's wallet)
========================= */

async function markRewarded(referralId) {

  const referral = allReferrals.find(r => r.id === referralId);
  if (!referral) return;

  const ok = window.confirm(
    `Credit ₹${referral.rewardAmount || 0} to ${referral.referrerName || "this user"}'s wallet?`
  );
  if (!ok) return;

  try {

    const referrerRef = doc(db, "users", referral.referrerId);
    const referrerSnap = await getDoc(referrerRef);

    const currentBalance = referrerSnap.exists() ? balanceOf(referrerSnap.data()) : 0;
    const rewardAmount = Number(referral.rewardAmount) || 0;
    const newBalance = currentBalance + rewardAmount;

    await updateDoc(referrerRef, { walletBalance: newBalance });

    await addDoc(collection(db, "walletTransactions"), {
      userId: referral.referrerId,
      customerName: referral.referrerName || "Customer",
      type: "credit",
      amount: rewardAmount,
      reason: `Referral reward for referring ${referral.referredName || "a new customer"}`,
      balanceAfter: newBalance,
      createdAt: serverTimestamp()
    });

    await updateDoc(doc(db, "referrals", referralId), {
      status: "Rewarded",
      rewardedAt: serverTimestamp()
    });

    await logAdminAction("Credited referral reward", "Referrals", {
      referralId,
      referrerId: referral.referrerId,
      amount: rewardAmount
    });

    const idx = allReferrals.findIndex(r => r.id === referralId);
    if (idx !== -1) {
      allReferrals[idx] = { ...allReferrals[idx], status: "Rewarded" };
    }

    renderSummary();
    renderReferralsList();
    showToast("Reward credited to wallet", "success");

  } catch (error) {

    console.error("Mark rewarded error:", error);
    showToast(error.message || "Failed to process reward.", "danger");

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
  loadReferrals();

});
