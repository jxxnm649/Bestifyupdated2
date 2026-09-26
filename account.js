import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
const DEFAULT_AVATAR = "https://api.dicebear.com/7.x/initials/svg?seed=U&backgroundColor=F2A93B";

const accAvatar = document.getElementById("accAvatar");
const accName = document.getElementById("accName");
const accEmail = document.getElementById("accEmail");
const accWalletBalance = document.getElementById("accWalletBalance");
const recentlyViewedSection = document.getElementById("recentlyViewedSection");
const recentlyViewedStrip = document.getElementById("recentlyViewedStrip");
const rateSuggestion = document.getElementById("rateSuggestion");
const logoutBtn = document.getElementById("logoutBtn");

const accAvatarWrap = document.getElementById("accAvatarWrap");
const accImgViewer = document.getElementById("accImgViewer");
const accImgViewerImg = document.getElementById("accImgViewerImg");
const accImgViewerClose = document.getElementById("accImgViewerClose");

if (accAvatarWrap) {
  accAvatarWrap.addEventListener("click", () => {
    accImgViewerImg.src = accAvatar.src;
    accImgViewer.classList.add("show");
  });
}
if (accImgViewerClose) {
  accImgViewerClose.addEventListener("click", () => accImgViewer.classList.remove("show"));
}
if (accImgViewer) {
  accImgViewer.addEventListener("click", (e) => {
    if (e.target === accImgViewer) accImgViewer.classList.remove("show");
  });
}

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.href = "login.html";
  } catch (error) {
    alert(error.message);
  }
});

function renderRecentlyViewed(list) {

  if (!list || !list.length) return;

  recentlyViewedSection.style.display = "block";

  recentlyViewedStrip.innerHTML = list.map(item => `
    <a href="product.html?id=${escapeHtml(item.productId)}" class="acc-rv-item">
      <img src="${escapeHtml(item.image || "")}" alt="${escapeHtml(item.productName || "")}">
      <div class="acc-rv-name">${escapeHtml(item.productName || "")}</div>
    </a>
  `).join("");

}

async function loadRateSuggestion(uid) {

  try {

    const ordersSnap = await getDocs(
      query(collection(db, "orders"), where("userId", "==", uid), where("status", "==", "Delivered"))
    );

    if (ordersSnap.empty) return;

    const orders = ordersSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return tb - ta;
      });

    const latestOrder = orders[0];
    const firstProduct = (latestOrder.products || [])[0];

    if (!firstProduct) return;

    rateSuggestion.style.display = "block";
    rateSuggestion.innerHTML = `
      <a href="product.html?id=${escapeHtml(firstProduct.id || "")}#commentsSection" class="acc-rate-card">
        <img src="${escapeHtml(firstProduct.image || "")}" alt="${escapeHtml(firstProduct.productName || "")}">
        <div>
          <div class="acc-rate-title">How was ${escapeHtml(firstProduct.productName || "your order")}?</div>
          <div class="acc-rate-sub">Tap to share a quick review →</div>
        </div>
      </a>
    `;

  } catch (error) {
    console.error("Rate suggestion load error:", error);
  }

}

onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {

    const userSnap = await getDoc(doc(db, "users", user.uid));
    const data = userSnap.exists() ? userSnap.data() : {};

    accName.textContent = data.name || user.email || "Bestify User";
    accEmail.textContent = data.email || user.email || "";
    accAvatar.src = data.profilePicture || DEFAULT_AVATAR;
    accWalletBalance.textContent = `₹${Number(data.walletBalance || 0).toLocaleString("en-IN")}`;

    renderRecentlyViewed(data.recentlyViewed || []);

  } catch (error) {
    console.error("Account hub load error:", error);
  }

  loadRateSuggestion(user.uid);
  loadVendorLink(user.uid);

});

async function loadVendorLink(uid) {

  const row = document.getElementById("vendorLinkRow");
  const label = document.getElementById("vendorLinkText");
  if (!row) return;

  try {

    const vendorSnap = await getDoc(doc(db, "vendors", uid));

    if (vendorSnap.exists() && vendorSnap.data().status === "Active") {
      row.href = "vendor/dashboard.html";
      label.textContent = "Supplier Dashboard";
    } else {
      row.href = "vendor-apply.html";
      label.textContent = "Become a Supplier";
    }

    row.style.display = "flex";

  } catch (error) {
    console.error("Vendor link check error:", error);
  }

}
