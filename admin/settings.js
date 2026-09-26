import { auth, db } from "../firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { showToast } from "../design-system.js";
import { logAdminAction } from "./audit.js";
import { uploadToCloudinary as uploadToCloudinaryWithProgress, mountProgressBar } from "../upload-progress.js";


const SETTINGS_DOC = doc(db, "settings", "store");

const settingsLoading = document.getElementById("settingsLoading");
const settingsForm = document.getElementById("settingsForm");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const settingsMeta = document.getElementById("settingsMeta");

const storeName = document.getElementById("storeName");
const supportEmail = document.getElementById("supportEmail");
const supportPhone = document.getElementById("supportPhone");
const storeAddress = document.getElementById("storeAddress");

const shippingFee = document.getElementById("shippingFee");
const freeShippingThreshold = document.getElementById("freeShippingThreshold");
const taxRate = document.getElementById("taxRate");

const codEnabled = document.getElementById("codEnabled");
const onlinePaymentsEnabled = document.getElementById("onlinePaymentsEnabled");
const maintenanceMode = document.getElementById("maintenanceMode");

const DEFAULTS = {
  storeName: "Bestify Mobile",
  supportEmail: "",
  supportPhone: "",
  storeAddress: "",
  shippingFee: 0,
  freeShippingThreshold: 0,
  taxRate: 0,
  codEnabled: true,
  onlinePaymentsEnabled: false,
  maintenanceMode: false
};

let currentSettings = { ...DEFAULTS };


/* =========================
   HELPERS
========================= */

function formatDateTime(value) {
  try {
    const d = value?.toDate ? value.toDate() : new Date(value);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
      " · " +
      d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function applyToForm(settings) {

  storeName.value = settings.storeName ?? DEFAULTS.storeName;
  supportEmail.value = settings.supportEmail ?? "";
  supportPhone.value = settings.supportPhone ?? "";
  storeAddress.value = settings.storeAddress ?? "";

  if (settings.homeBanners && settings.homeBanners.length) {
    bannerManager.setLoaded(settings.homeBanners.map(b => ({ ...b })));
  } else if (settings.homeBannerUrl) {
    // migrate legacy single-banner field into the new list, display-only
    // until the admin adds/edits something (which then saves it properly)
    bannerManager.setLoaded([{ id: "legacy", url: settings.homeBannerUrl, hidden: false }]);
  } else {
    bannerManager.setLoaded([]);
  }

  shopPhotoManager.setLoaded(
    (settings.shopPhotos && settings.shopPhotos.length) ? settings.shopPhotos.map(p => ({ ...p })) : []
  );

  shippingFee.value = settings.shippingFee ?? 0;
  freeShippingThreshold.value = settings.freeShippingThreshold ?? 0;
  taxRate.value = settings.taxRate ?? 0;

  codEnabled.checked = settings.codEnabled !== false;
  onlinePaymentsEnabled.checked = settings.onlinePaymentsEnabled === true;
  maintenanceMode.checked = settings.maintenanceMode === true;

}


/* =========================
   IMAGE MANAGERS (multiple, real Cloudinary uploads —
   add / replace / hide / delete). Used for both the home banner
   carousel (settings.homeBanners) and the shop-photo strip in the
   "Visit Us" section (settings.shopPhotos).
========================= */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Tap a thumbnail to see the photo full size — quick way to confirm
// which image is which before hiding/replacing/deleting it.
function openImagePreview(url, label) {

  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed; inset:0; background:rgba(0,0,0,.85); z-index:9999;" +
    "display:flex; align-items:center; justify-content:center; padding:20px; cursor:zoom-out;";

  overlay.innerHTML = `
    <img src="${url}" alt="${label}" style="max-width:100%; max-height:100%; border-radius:10px; box-shadow:0 10px 40px rgba(0,0,0,.5);">
    <button type="button" aria-label="Close"
      style="position:absolute; top:14px; right:18px; background:rgba(255,255,255,.15); color:#fff;
             border:none; width:38px; height:38px; border-radius:50%; font-size:22px; cursor:pointer;">&times;</button>
  `;

  overlay.addEventListener("click", () => overlay.remove());
  document.body.appendChild(overlay);

}

function createImageManager({ field, listWrapId, fileInputId, uploadBtnId, statusId, itemLabel, emptyLabel }) {

  const listWrap = document.getElementById(listWrapId);
  const fileInput = document.getElementById(fileInputId);
  const uploadBtn = document.getElementById(uploadBtnId);
  const status = document.getElementById(statusId);

  const manager = { items: [] };

  async function save() {
    await setDoc(SETTINGS_DOC, { [field]: manager.items, updatedAt: serverTimestamp() }, { merge: true });
    await logAdminAction(`Updated ${itemLabel.toLowerCase()}s`, "Settings", { count: manager.items.length });
  }

  function render() {
    if (!listWrap) return;

    if (!manager.items.length) {
      listWrap.innerHTML = `<div style="font-size:12px;opacity:.6;">${emptyLabel}</div>`;
      return;
    }

    listWrap.innerHTML = manager.items.map(item => `
      <div class="bf-card" data-id="${item.id}" style="display:flex; gap:10px; align-items:center; padding:10px; ${item.hidden ? "opacity:.5;" : ""}">
        <img src="${item.url}" alt="${itemLabel}" class="im-thumb" style="width:90px; height:38px; object-fit:cover; border-radius:6px; border:1px solid var(--line); flex-shrink:0; cursor:zoom-in;" title="Tap to view full size">
        <div style="flex:1; font-size:12px;">${item.hidden ? "Hidden" : "Visible"}</div>
        <button type="button" class="bf-btn bf-btn-ghost bf-btn-sm im-toggle-btn" style="width:auto;">${item.hidden ? "Show" : "Hide"}</button>
        <button type="button" class="bf-btn bf-btn-ghost bf-btn-sm im-replace-btn" style="width:auto;">Replace</button>
        <button type="button" class="bf-btn bf-btn-danger bf-btn-sm im-delete-btn" style="width:auto;">Delete</button>
        <input type="file" accept="image/*" class="im-replace-input" style="display:none;">
      </div>
    `).join("");
  }

  function setLoaded(items) {
    manager.items = items;
    render();
  }

  if (uploadBtn) {
    uploadBtn.addEventListener("click", async () => {

      const files = Array.from(fileInput.files || []);
      if (!files.length) {
        status.textContent = "Choose at least one photo first.";
        status.style.color = "var(--bf-danger, #c0392b)";
        return;
      }

      uploadBtn.disabled = true;
      status.textContent = "";
      status.style.color = "var(--ink-soft)";
      const bar = mountProgressBar(status.parentElement);

      let uploadedCount = 0;

      try {

        for (let i = 0; i < files.length; i++) {

          const file = files[i];
          const fileNum = i + 1;

          const url = await uploadToCloudinaryWithProgress(file, (pct) => {
            bar.update(pct);
            bar.label.textContent = files.length > 1
              ? `Uploading photo ${fileNum} of ${files.length}... ${pct}%`
              : `Uploading... ${pct}%`;
          });

          manager.items.push({ id: uid(), url, hidden: false });
          uploadedCount++;

        }

        bar.done();
        await save();
        render();

        fileInput.value = "";
        status.textContent = files.length > 1
          ? `✓ ${uploadedCount} ${itemLabel.toLowerCase()}s added — live on the home page now.`
          : `✓ ${itemLabel} added — live on the home page now.`;
        status.style.color = "var(--bf-success, #2e7d32)";
        showToast(`${uploadedCount} ${itemLabel.toLowerCase()}${uploadedCount > 1 ? "s" : ""} added`, "success");

      } catch (error) {
        console.error(error);
        // keep whatever uploaded successfully before the failure
        if (uploadedCount > 0) { await save(); render(); }
        status.textContent = error.message || "Upload failed.";
        status.style.color = "var(--bf-danger, #c0392b)";
      } finally {
        uploadBtn.disabled = false;
        bar.remove();
      }

    });
  }

  if (listWrap) {
    listWrap.addEventListener("click", async (e) => {

      const row = e.target.closest("[data-id]");
      if (!row) return;
      const id = row.dataset.id;
      const item = manager.items.find(x => x.id === id);
      if (!item) return;

      if (e.target.classList.contains("im-thumb")) {
        openImagePreview(item.url, itemLabel);
        return;
      }

      if (e.target.classList.contains("im-toggle-btn")) {

        item.hidden = !item.hidden;
        render();
        try {
          await save();
          showToast(item.hidden ? `${itemLabel} hidden` : `${itemLabel} shown`, "success");
        } catch (error) {
          console.error(error);
          showToast("Couldn't save — try again", "error");
        }

      } else if (e.target.classList.contains("im-delete-btn")) {

        if (!confirm(`Delete this ${itemLabel.toLowerCase()}?`)) return;
        manager.items = manager.items.filter(x => x.id !== id);
        render();
        try {
          await save();
          showToast(`${itemLabel} deleted`, "success");
        } catch (error) {
          console.error(error);
          showToast("Couldn't save — try again", "error");
        }

      } else if (e.target.classList.contains("im-replace-btn")) {

        row.querySelector(".im-replace-input").click();

      }
    });

    listWrap.addEventListener("change", async (e) => {
      if (!e.target.classList.contains("im-replace-input")) return;

      const row = e.target.closest("[data-id]");
      const id = row.dataset.id;
      const item = manager.items.find(x => x.id === id);
      const file = e.target.files[0];
      if (!item || !file) return;

      const bar = mountProgressBar(row);

      try {
        const url = await uploadToCloudinaryWithProgress(file, (pct) => bar.update(pct));
        bar.done();
        item.url = url;
        render();
        await save();
        showToast(`${itemLabel} replaced`, "success");
      } catch (error) {
        console.error(error);
        bar.remove();
        showToast("Upload failed — try again", "error");
      }
    });
  }

  return { setLoaded };
}

const bannerManager = createImageManager({
  field: "homeBanners",
  listWrapId: "bannerListWrap",
  fileInputId: "bannerFile",
  uploadBtnId: "uploadBannerBtn",
  statusId: "bannerUploadStatus",
  itemLabel: "Banner",
  emptyLabel: "No banners yet — add one below."
});

const shopPhotoManager = createImageManager({
  field: "shopPhotos",
  listWrapId: "shopPhotoListWrap",
  fileInputId: "shopPhotoFile",
  uploadBtnId: "uploadShopPhotoBtn",
  statusId: "shopPhotoUploadStatus",
  itemLabel: "Photo",
  emptyLabel: "No photos yet — add one below."
});

function readFromForm() {
  return {
    storeName: storeName.value.trim() || DEFAULTS.storeName,
    supportEmail: supportEmail.value.trim(),
    supportPhone: supportPhone.value.trim(),
    storeAddress: storeAddress.value.trim(),
    shippingFee: Number(shippingFee.value) || 0,
    freeShippingThreshold: Number(freeShippingThreshold.value) || 0,
    taxRate: Math.min(100, Math.max(0, Number(taxRate.value) || 0)),
    codEnabled: codEnabled.checked,
    onlinePaymentsEnabled: onlinePaymentsEnabled.checked,
    maintenanceMode: maintenanceMode.checked
  };
}


/* =========================
   LOAD
========================= */

async function loadSettings() {

  try {

    const snap = await getDoc(SETTINGS_DOC);

    if (snap.exists()) {
      currentSettings = { ...DEFAULTS, ...snap.data() };

      if (snap.data().updatedAt) {
        settingsMeta.textContent =
          "Last updated " + formatDateTime(snap.data().updatedAt) +
          (snap.data().updatedBy ? " by " + snap.data().updatedBy : "");
      }
    } else {
      currentSettings = { ...DEFAULTS };
    }

    applyToForm(currentSettings);

    settingsLoading.classList.add("bf-hidden");
    settingsForm.classList.remove("bf-hidden");

  } catch (error) {

    console.error("Settings load error:", error);

    settingsLoading.innerHTML = `
      Unable to load settings.
      <button type="button" class="bf-btn bf-btn-ghost bf-btn-sm" id="settingsRetryBtn" style="margin-left:8px;">Retry</button>
    `;

    const retryBtn = document.getElementById("settingsRetryBtn");
    if (retryBtn) retryBtn.addEventListener("click", loadSettings);

    showToast(error.message || "Failed to load settings.", "danger");

  }

}


/* =========================
   SAVE
========================= */

settingsForm.addEventListener("submit", async (e) => {

  e.preventDefault();

  const next = readFromForm();

  saveSettingsBtn.disabled = true;
  const originalLabel = saveSettingsBtn.textContent;
  saveSettingsBtn.textContent = "Saving...";

  try {

    const user = auth.currentUser;

    await setDoc(SETTINGS_DOC, {
      ...next,
      updatedAt: serverTimestamp(),
      updatedBy: user ? (user.email || user.uid) : "Unknown"
    }, { merge: true });

    // Only log fields that actually changed, so entries stay meaningful.
    const changed = {};
    Object.keys(next).forEach(key => {
      if (currentSettings[key] !== next[key]) {
        changed[key] = { from: currentSettings[key], to: next[key] };
      }
    });

    if (Object.keys(changed).length > 0) {
      await logAdminAction("Updated store settings", "Settings", changed);
    }

    currentSettings = next;

    showToast("Settings saved", "success");
    settingsMeta.textContent = "Last updated just now";

  } catch (error) {

    console.error("Settings save error:", error);
    showToast(error.message || "Failed to save settings.", "danger");

  } finally {

    saveSettingsBtn.disabled = false;
    saveSettingsBtn.textContent = originalLabel;

  }

});


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

  loadSettings();

});
