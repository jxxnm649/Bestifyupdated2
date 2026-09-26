import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  getDocs,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { uploadToCloudinary as uploadToCloudinaryWithProgress } from "./upload-progress.js";

import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-functions.js";

import { raiseAdminAlert } from "./admin-alerts.js";
import { nextSequenceNumber } from "./counters.js";

const functions = getFunctions();
const createRazorpayOrder = httpsCallable(functions, "createRazorpayOrder");
const verifyRazorpayPayment = httpsCallable(functions, "verifyRazorpayPayment");

let currentUser = null;
let uploadedImages = []; // { file, url|null, uploading }
let realProducts = [];   // real Covers products, fetched once

const CATEGORY_KEYWORDS = ["cover", "case"];


/* =========================
   AUTH
========================= */

onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) {
      const data = snap.data();
      const nameField = document.getElementById("custName");
      const phoneField = document.getElementById("custPhone");
      const addressField = document.getElementById("custAddress");
      if (data.name) nameField.value = data.name;
      if (data.mobile) phoneField.value = data.mobile;
      if (data.address) addressField.value = data.address;
    }
  } catch (error) {
    console.log(error);
  }

  loadRealProducts();

});


/* =========================
   STEP NAVIGATION
========================= */

function updateStepperUI(activeStep) {
  for (let i = 1; i <= 4; i++) {
    const ind = document.getElementById("stepInd" + i);
    ind.classList.remove("active", "completed");
    if (i < activeStep) {
      ind.classList.add("completed");
      ind.innerHTML = '<i class="fa-solid fa-check"></i>';
    } else if (i === activeStep) {
      ind.classList.add("active");
      ind.innerText = i;
    } else {
      ind.innerText = i;
    }
  }
}

document.getElementById("btnStep1").addEventListener("click", () => {
  if (uploadedImages.length === 0 && !confirm("No photo uploaded. Want to proceed anyway?")) return;

  document.getElementById("step1").classList.add("completed");
  document.getElementById("btnStep1").style.display = "none";
  document.getElementById("step2").classList.add("visible");
  updateStepperUI(2);
  document.getElementById("step2").scrollIntoView({ behavior: "smooth" });
});

document.getElementById("btnStep2").addEventListener("click", () => {
  document.getElementById("step2").classList.add("completed");
  document.getElementById("btnStep2").style.display = "none";
  document.getElementById("step3").classList.add("visible");
  updateStepperUI(3);
  document.getElementById("step3").scrollIntoView({ behavior: "smooth" });
});

document.getElementById("btnStep3").addEventListener("click", () => {

  const name = document.getElementById("custName").value.trim();
  const phone = document.getElementById("custPhone").value.trim();
  const address = document.getElementById("custAddress").value.trim();
  const pincode = document.getElementById("custPincode").value.trim();

  if (!name || !phone || !address || !pincode) {
    alert("Please fill Name, Phone, Address & Pincode!");
    return;
  }

  document.getElementById("step3").classList.add("completed");
  document.getElementById("btnStep3").style.display = "none";

  document.getElementById("sumName").innerText = name;
  document.getElementById("sumContact").innerText = phone;
  document.getElementById("sumPhotos").innerText = uploadedImages.length + " Photo(s)";

  const selected = getSelectedProducts();
  document.getElementById("sumItems").innerText = selected.length
    ? selected.map(p => p.productName).join(", ")
    : "None";
  document.getElementById("sumTotal").innerText = "₹" + selected.reduce((s, p) => s + Number(p.price || 0), 0);

  document.getElementById("step4").classList.add("visible");
  updateStepperUI(4);
  document.getElementById("step4").scrollIntoView({ behavior: "smooth" });

});


/* =========================
   PHOTOS — real Cloudinary upload (same account already
   used for product photos elsewhere in the admin panel)
========================= */

const directCameraInput = document.getElementById("directCameraInput");
const galleryFileInput = document.getElementById("galleryFileInput");

document.getElementById("cameraTriggerBtn").addEventListener("click", () => directCameraInput.click());
document.getElementById("galleryTriggerBtn").addEventListener("click", () => galleryFileInput.click());

directCameraInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) addPhoto(file);
  directCameraInput.value = "";
});

galleryFileInput.addEventListener("change", (e) => {
  Array.from(e.target.files).forEach(addPhoto);
  galleryFileInput.value = "";
});

async function addPhoto(file) {

  if (uploadedImages.length >= 6) {
    alert("Max 6 photos allowed.");
    return;
  }

  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    file, url: null, uploading: true, progress: 0,
    previewUrl: URL.createObjectURL(file)
  };
  uploadedImages.push(entry);
  renderThumbnails();

  try {
    entry.url = await uploadToCloudinaryWithProgress(file, (pct) => {
      entry.progress = pct;
      const badge = document.getElementById(`upload-pct-${entry.id}`);
      if (badge) badge.textContent = `${pct}%`;
    });
  } catch (error) {
    console.error("Photo upload error:", error);
    alert("Could not upload that photo. Please try again.");
    uploadedImages = uploadedImages.filter(e => e !== entry);
  } finally {
    entry.uploading = false;
    renderThumbnails();
  }

}

function renderThumbnails() {
  const row = document.getElementById("photoRow");
  row.innerHTML = "";

  uploadedImages.forEach((entry, i) => {
    const div = document.createElement("div");
    div.className = "image-preview-card" + (entry.uploading ? " uploading" : "");
    div.innerHTML = `<img src="${entry.previewUrl}">` +
      (entry.uploading ? `<div class="upload-pct-overlay" id="upload-pct-${entry.id}">${entry.progress || 0}%</div>` : "") +
      `<button type="button" class="remove-img-btn" data-index="${i}">✕</button>`;
    row.appendChild(div);
  });

  // Keep the two trigger boxes available as long as we're under the cap.
  if (uploadedImages.length < 6) {
    row.innerHTML += `
      <div class="camera-trigger-box" id="cameraTriggerBtn2"><i class="fa-solid fa-camera"></i><span>Take Photo</span></div>
      <div class="camera-trigger-box" style="border-color:#3b82f6; background:#eff6ff; color:#1d4ed8;" id="galleryTriggerBtn2"><i class="fa-solid fa-images"></i><span>Gallery</span></div>
    `;
    document.getElementById("cameraTriggerBtn2").addEventListener("click", () => directCameraInput.click());
    document.getElementById("galleryTriggerBtn2").addEventListener("click", () => galleryFileInput.click());
  }

  row.querySelectorAll(".remove-img-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      uploadedImages.splice(Number(btn.dataset.index), 1);
      renderThumbnails();
    });
  });
}

renderThumbnails();


/* =========================
   STEP 2 — real products (category: Covers)
========================= */

async function loadRealProducts() {

  const scroll = document.getElementById("productScroll");

  try {

    const snap = await getDocs(collection(db, "products"));

    realProducts = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => {
        const c = (p.category || "").toLowerCase();
        return CATEGORY_KEYWORDS.some(k => c.includes(k));
      });

    if (!realProducts.length) {
      scroll.innerHTML = `<p style="font-size:13px;color:#64748b;padding:10px;">No cover products available right now.</p>`;
      return;
    }

    scroll.innerHTML = realProducts.map(p => `
      <div class="product-card" data-id="${p.id}">
        <input type="checkbox" data-id="${p.id}">
        <img src="${p.image || ""}" alt="${escapeHtml(p.productName || "")}">
        <div class="product-info-box">
          <div class="product-title">${escapeHtml(p.productName || "Product")}</div>
          <div class="product-price">₹${p.price ?? 0}</div>
        </div>
      </div>
    `).join("");

    scroll.querySelectorAll(".product-card").forEach(card => {
      card.addEventListener("click", (e) => {
        const cb = card.querySelector('input[type="checkbox"]');
        if (e.target !== cb) cb.checked = !cb.checked;
        card.classList.toggle("selected", cb.checked);
      });
    });

  } catch (error) {
    console.error(error);
    scroll.innerHTML = `<p style="font-size:13px;color:#64748b;padding:10px;">Unable to load products.</p>`;
  }

}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[m]);
}

function getSelectedProducts() {
  const ids = Array.from(document.querySelectorAll('.product-card input[type="checkbox"]:checked')).map(cb => cb.dataset.id);
  return realProducts.filter(p => ids.includes(p.id));
}


/* =========================
   PAYMENT MODAL
========================= */

const paymentModal = document.getElementById("paymentModal");

document.getElementById("btnOpenPayment").addEventListener("click", () => {
  paymentModal.style.display = "flex";
});
document.getElementById("closePaymentModalBtn").addEventListener("click", () => {
  paymentModal.style.display = "none";
});


/* =========================
   REAL CASHBACK RATE (same admin-configured setting used by
   the regular checkout — Settings → Cashback Rewards)
========================= */

async function computeCashbackAmount(totalAmount) {
  try {
    const settingsSnap = await getDoc(doc(db, "settings", "store"));
    if (!settingsSnap.exists()) return 0;

    const settings = settingsSnap.data();
    if (settings.cashbackEnabled !== true) return 0;

    const ratePercent = Number(settings.cashbackRatePercent) || 0;
    const maxAmount = Number(settings.cashbackMaxAmount) || 0;

    let amount = Math.round(totalAmount * (ratePercent / 100));
    if (maxAmount > 0) amount = Math.min(amount, maxAmount);

    return Math.max(0, amount);
  } catch (error) {
    console.log(error);
    return 0;
  }
}


/* =========================
   PLACE ORDER (real Firestore — same schema as the regular
   checkout, so it shows up correctly in My Orders / admin)
========================= */

document.getElementById("btnConfirmPayment").addEventListener("click", async () => {

  const btn = document.getElementById("btnConfirmPayment");
  const paymentMethod = document.querySelector('input[name="payType"]:checked').value;

  const customerName = document.getElementById("custName").value.trim();
  const mobile = document.getElementById("custPhone").value.trim();
  const address = `${document.getElementById("custAddress").value.trim()} - ${document.getElementById("custPincode").value.trim()}`;
  const note = document.getElementById("userInbox").value.trim();

  const selectedProducts = getSelectedProducts();

  if (uploadedImages.some(e => e.uploading)) {
    alert("Please wait for your photos to finish uploading.");
    return;
  }

  const photoUrls = uploadedImages.map(e => e.url).filter(Boolean);

  const products = selectedProducts.map(p => ({
    id: p.id,
    productName: p.productName,
    price: Number(p.price) || 0,
    qty: 1,
    image: p.image || "",
    vendorId: p.vendorId || null
  }));

  const totalAmount = products.reduce((s, p) => s + p.price * p.qty, 0);

  btn.disabled = true;

  try {

    if (paymentMethod === "cod") {

      btn.textContent = "Placing Order...";

      const cashbackAmount = await computeCashbackAmount(totalAmount);
      const orderNumber = await nextSequenceNumber("orders");

      const orderRef = await addDoc(collection(db, "orders"), {
        userId: currentUser.uid,
        customerName,
        mobile,
        address,
        products,
        vendorIds: [...new Set(products.map(p => p.vendorId).filter(Boolean))],
        orderNumber,
        total: totalAmount,
        paymentMethod: "cod",
        status: "Pending",
        customPhotoUrls: photoUrls,
        customNote: note,
        createdAt: new Date(),
        cashbackAmount,
        cashbackStatus: cashbackAmount > 0 ? "pending" : "none"
      });

      raiseAdminAlert("order", `New custom order placed by ${customerName || "a customer"} — ₹${totalAmount}`, {
        userId: currentUser.uid,
        orderId: orderRef.id
      });

      showSuccess(customerName, photoUrls);

    } else {

      btn.textContent = "Starting Payment...";

      let rzpOrder;
      try {
        const { data } = await createRazorpayOrder({ amount: totalAmount || 1 });
        rzpOrder = data;
      } catch (error) {
        console.log(error);
        alert("Could not start payment. Please try again.");
        return;
      }

      const options = {
        key: rzpOrder.keyId,
        order_id: rzpOrder.orderId,
        amount: rzpOrder.amount,
        currency: rzpOrder.currency,
        name: "Bestify Store",
        description: "Custom Cover Order",
        handler: async function (response) {
          try {
            const { data } = await verifyRazorpayPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              orderData: { customerName, mobile, address, products, cartItemIds: [] }
            });
            showSuccess(customerName, photoUrls);
          } catch (error) {
            console.log(error);
            window.location.href = "payment-failed.html";
          }
        },
        modal: { ondismiss: function () { window.location.href = "payment-failed.html"; } },
        theme: { color: "#005c36" }
      };

      const rzp = new Razorpay(options);
      rzp.on("payment.failed", () => { window.location.href = "payment-failed.html"; });
      rzp.open();

    }

  } catch (error) {
    console.error(error);
    alert(error.message || "Failed to place order.");
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Confirm Payment <i class="fa-solid fa-arrow-right"></i>';
  }

});

function showSuccess(name, photoUrls) {
  paymentModal.style.display = "none";
  document.getElementById("popCustName").innerText = name;
  document.getElementById("popImgPreview").innerHTML = photoUrls
    .map(u => `<img src="${u}" style="width:50px;height:50px;object-fit:cover;border-radius:8px;">`)
    .join("");
  document.getElementById("successModal").style.display = "flex";
}
