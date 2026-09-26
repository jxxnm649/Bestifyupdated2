import { auth, db } from "../firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";/**
 * Guards a vendor dashboard page.
 * - Redirects to login if not signed in.
 * - Redirects to the application page if no vendor record exists.
 * - Shows a pending/blocked full-page state if not yet Active.
 * - Calls onReady(user, vendorDoc) once the vendor is confirmed Active.
 */
export function guardVendorPage(onReady) {

  onAuthStateChanged(auth, async (user) => {

    if (!user) {
      window.location.href = "../login.html";
      return;
    }

    try {

      const vendorSnap = await getDoc(doc(db, "vendors", user.uid));

      if (!vendorSnap.exists()) {
        window.location.href = "../vendor-apply.html";
        return;
      }

      const vendor = { id: vendorSnap.id, ...vendorSnap.data() };

      if (vendor.status !== "Active") {
        renderBlockedState(vendor.status);
        return;
      }

      onReady(user, vendor);

    } catch (error) {
      console.error("Vendor access check error:", error);
      renderErrorState();
    }

  });

}

function renderBlockedState(status) {

  const isPending = status === "Pending";

  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:var(--font-body, sans-serif);">
      <div>
        <div style="font-size:44px;margin-bottom:10px;">${isPending ? "⏳" : "🚫"}</div>
        <h2 style="margin:0 0 8px;">${isPending ? "Application Pending" : "Account Blocked"}</h2>
        <p style="color:#3A4A6B;margin:0 0 16px;">
          ${isPending
            ? "Your supplier application is still under review."
            : "Your supplier account has been blocked. Contact support for details."}
        </p>
        <div style="display:flex;gap:14px;justify-content:center;">
          <a href="../home.html" style="color:#D98925;font-weight:600;text-decoration:none;">← Back to Home</a>
          <button type="button" id="blockedLogoutBtn" style="color:#c62828;font-weight:600;background:none;border:none;cursor:pointer;font-size:14px;">🚪 Logout</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("blockedLogoutBtn").addEventListener("click", async () => {
    try {
      await signOut(auth);
      window.location.href = "../login.html";
    } catch (error) {
      alert(error.message);
    }
  });

}

function renderErrorState() {
  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:var(--font-body, sans-serif);">
      <div>
        <div style="font-size:44px;margin-bottom:10px;">❌</div>
        <h2 style="margin:0 0 8px;">Something went wrong</h2>
        <p style="color:#3A4A6B;margin:0 0 16px;">Unable to verify your supplier account. Please try again.</p>
        <a href="../home.html" style="color:#D98925;font-weight:600;text-decoration:none;">← Back to Home</a>
      </div>
    </div>
  `;
}

export function wireLogout(logoutBtn) {
  if (!logoutBtn) return;
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
      window.location.href = "../login.html";
    } catch (error) {
      alert(error.message);
    }
  });
}
