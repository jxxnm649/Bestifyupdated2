import { auth, db } from "./firebase.js";

import { onAuthStateChanged }
from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc,
  updateDoc
}
from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { uploadToCloudinary as uploadToCloudinaryWithProgress, mountProgressBar } from "./upload-progress.js";

const form = document.getElementById("profileForm");
const saveBtn = document.getElementById("profileSaveBtn");
const profilePicPreview = document.getElementById("profilePicPreview");
const profilePicInput = document.getElementById("profilePicInput");
const profilePicDeleteBtn = document.getElementById("profilePicDeleteBtn");
const completionPercent = document.getElementById("completionPercent");
const completionFill = document.getElementById("completionFill");

const DEFAULT_AVATAR = "https://api.dicebear.com/7.x/initials/svg?seed=U&backgroundColor=F2A93B";

const FIELD_IDS = [
  "name", "mobile", "secondaryPhone", "gender", "dob", "work",
  "address", "district", "city", "state", "country", "pincode"
];

let selectedPicFile = null;
let currentPicUrl = "";

function updateCompletion(data) {

  const trackedValues = [
    data.name, data.mobile, data.secondaryPhone, data.gender, data.dob,
    data.work, data.address, data.district, data.city, data.state, data.country, data.pincode,
    data.profilePicture
  ];

  const filled = trackedValues.filter(v => v && String(v).trim().length > 0).length;
  const pct = Math.round((filled / trackedValues.length) * 100);

  completionPercent.textContent = `${pct}%`;
  completionFill.style.width = `${pct}%`;

}

function readCurrentFormData() {
  const data = {};
  FIELD_IDS.forEach((id) => {
    data[id] = document.getElementById(id).value.trim();
  });
  data.profilePicture = currentPicUrl;
  return data;
}

profilePicInput.addEventListener("change", () => {

  const file = profilePicInput.files[0];
  if (!file) return;

  selectedPicFile = file;
  profilePicPreview.src = URL.createObjectURL(file);

});

profilePicDeleteBtn.addEventListener("click", async () => {

  const ok = window.confirm("Remove your profile picture?");
  if (!ok) return;

  selectedPicFile = null;
  currentPicUrl = "";
  profilePicInput.value = "";
  profilePicPreview.src = DEFAULT_AVATAR;

  try {
    await updateDoc(doc(db, "users", auth.currentUser.uid), { profilePicture: "" });
    updateCompletion(readCurrentFormData());
  } catch (error) {
    console.error("Remove profile picture error:", error);
  }

});

async function uploadProfilePic(onProgress) {

  if (!selectedPicFile) return currentPicUrl;

  return uploadToCloudinaryWithProgress(selectedPicFile, onProgress);

}

onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const docRef = doc(db, "users", user.uid);
  const docSnap = await getDoc(docRef);

  let data = {};

  if (docSnap.exists()) {
    data = docSnap.data();
  }

  document.getElementById("name").value = data.name || "";
  document.getElementById("email").value = data.email || user.email || "";
  document.getElementById("mobile").value = data.mobile || "";
  document.getElementById("secondaryPhone").value = data.secondaryPhone || "";
  document.getElementById("gender").value = data.gender || "";
  document.getElementById("dob").value = data.dob || "";
  document.getElementById("work").value = data.work || "";
  document.getElementById("address").value = data.address || "";
  document.getElementById("district").value = data.district || "";
  document.getElementById("city").value = data.city || "";
  document.getElementById("state").value = data.state || "";
  document.getElementById("country").value = data.country || "India";
  document.getElementById("pincode").value = data.pincode || "";

  currentPicUrl = data.profilePicture || "";
  profilePicPreview.src = currentPicUrl || DEFAULT_AVATAR;

  updateCompletion(data);

  FIELD_IDS.forEach((id) => {
    document.getElementById(id).addEventListener("input", () => {
      updateCompletion(readCurrentFormData());
    });
  });

  form.addEventListener("submit", async (e) => {

    e.preventDefault();

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    try {

      if (selectedPicFile) {
        const bar = mountProgressBar(profilePicPreview.parentElement);
        try {
          currentPicUrl = await uploadProfilePic((pct) => bar.update(pct));
          bar.done();
        } finally {
          bar.remove();
        }
      }

      const updateData = readCurrentFormData();

      await updateDoc(docRef, updateData);

      updateCompletion(updateData);
      selectedPicFile = null;

      alert("Profile Updated Successfully ✅");

    } catch (error) {
      console.error("Profile save error:", error);
      alert(error.message || "Failed to update profile.");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Profile";
    }

  });

});
