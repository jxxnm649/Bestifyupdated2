import { auth, db } from "../firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const fbList = document.getElementById("fbList");
const fbCount = document.getElementById("fbCount");
const fbCategoryFilter = document.getElementById("fbCategoryFilter");

let allFeedback = [];

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function formatDate(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
      " · " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function toMillis(ts) {
  if (!ts) return 0;
  return ts?.toDate ? ts.toDate().getTime() : new Date(ts).getTime();
}

async function loadFeedback() {

  try {

    const snapshot = await getDocs(collection(db, "feedback"));

    allFeedback = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

    renderList();

  } catch (error) {
    console.error("Feedback load error:", error);
    fbList.innerHTML = `<div class="bf-card" style="padding:20px;">❌ Unable to load feedback.</div>`;
  }

}

function renderList() {

  const category = fbCategoryFilter.value;
  const filtered = category === "All" ? allFeedback : allFeedback.filter(f => f.category === category);

  fbCount.textContent = `Showing ${filtered.length} of ${allFeedback.length} submissions`;

  if (!filtered.length) {
    fbList.innerHTML = `<div class="bf-card" style="padding:20px;">No feedback yet.</div>`;
    return;
  }

  fbList.innerHTML = filtered.map(f => `
    <div class="bf-card" style="padding:14px;">
      <div style="display:flex;justify-content:space-between;gap:8px;">
        <span class="bf-status-pill">${escapeHtml(f.category || "Other")}</span>
        <span style="font-size:12px;opacity:.6;">${formatDate(f.createdAt)}</span>
      </div>
      <p style="margin:10px 0 4px;font-size:14px;">${escapeHtml(f.message || "")}</p>
      <div style="font-size:12px;opacity:.6;">${escapeHtml(f.userEmail || "")}</div>
    </div>
  `).join("");

}

fbCategoryFilter.addEventListener("change", renderList);

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

  loadFeedback();

});
