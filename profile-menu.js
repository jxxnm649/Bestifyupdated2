import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { touchSession } from "./session-tracker.js";

async function vendorLinkHtml(uid) {
  try {
    const snap = await getDoc(doc(db, "vendors", uid));
    if (snap.exists() && snap.data().status === "Active") {
      return `<a href="vendor/dashboard.html">🏪 Supplier Dashboard</a>`;
    }
  } catch (error) {
    console.error("Vendor link check error:", error);
  }
  return `<a href="vendor-apply.html">🏪 Become a Supplier</a>`;
}

async function buildMenu(moreBtn, uid) {

  const popup = document.createElement("div");
  popup.className = "pm-popup";
  popup.id = "pmPopup";
  popup.innerHTML = `
    <a href="profile.html">👤 My Profile</a>
    <a href="orders.html">📦 My Orders</a>
    <a href="transactions.html">🧾 My Transactions</a>
    <a href="withdraw.html">💸 Withdraw Funds</a>
    <a href="wishlist.html">😊 Liked</a>
    <a href="chat.html">💬 Chat with Us</a>
    ${await vendorLinkHtml(uid)}
    <button type="button" class="pm-logout" id="pmLogoutBtn">🚪 Logout</button>
  `;

  document.body.appendChild(popup);

  moreBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    popup.classList.toggle("open");
  });

  document.addEventListener("click", (e) => {
    if (!popup.contains(e.target) && !moreBtn.contains(e.target)) {
      popup.classList.remove("open");
    }
  });

  document.getElementById("pmLogoutBtn").addEventListener("click", async () => {
    try {
      await signOut(auth);
      window.location.href = "login.html";
    } catch (error) {
      alert(error.message);
    }
  });

}

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  touchSession(user.uid);

  const moreBtn = document.getElementById("moreMenuBtn");
  if (moreBtn && !document.getElementById("pmPopup")) {
    buildMenu(moreBtn, user.uid);
  }
});
