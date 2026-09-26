import { db } from "../firebase.js";

import {
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { guardVendorPage, wireLogout } from "./vendor-common.js";

wireLogout(document.getElementById("logoutBtn"));

async function loadStats(user, vendor) {

  document.getElementById("shopNameLabel").textContent = vendor.shopName || "Dashboard";
  document.getElementById("statCommissionRate").textContent = `${vendor.commissionRate ?? 0}%`;
  document.getElementById("statWalletBalance").textContent = `₹${Number(vendor.walletBalance || 0).toLocaleString("en-IN")}`;

  try {

    // Products
    const productsSnap = await getDocs(
      query(collection(db, "products"), where("vendorId", "==", user.uid))
    );
    document.getElementById("statProducts").textContent = productsSnap.size;

    // This vendor's own sub-orders (one document per vendor per order)
    const ordersSnap = await getDocs(
      query(collection(db, "subOrders"), where("vendorId", "==", user.uid))
    );

    const pending = ordersSnap.docs.filter((d) => {
      const status = d.data().status;
      return !["DELIVERED", "CANCELLED"].includes(status);
    }).length;

    document.getElementById("statPendingOrders").textContent = pending;

    // Earnings = what the VENDOR keeps (vendorPayable), not the
    // commission Bestify takes. This previously summed commissionAmount,
    // which showed the vendor Bestify's cut as if it were their income.
    let totalEarnings = 0;
    ordersSnap.forEach((d) => {
      const s = d.data();
      if (s.status !== "CANCELLED") {
        totalEarnings += Number(s.vendorPayable || 0);
      }
    });

    document.getElementById("statEarnings").textContent = `₹${totalEarnings.toLocaleString("en-IN")}`;

  } catch (error) {
    console.error("Vendor dashboard stats error:", error);
  }

}

guardVendorPage(loadStats);
