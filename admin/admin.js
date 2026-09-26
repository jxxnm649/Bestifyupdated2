/* ============================================================
   Bestify Admin Panel
   Firebase Auth Guard + Dashboard Metrics
   ============================================================ */

import { auth, db } from "../firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { showToast } from "../design-system.js";
import { normalizeOrderStatus } from "../order-compat.js";


/* ============================================================
   ELEMENT REFS
   ============================================================ */

const initialLoadingState =
  document.getElementById("initialLoadingState");

const authRequiredState =
  document.getElementById("authRequiredState");

const accessDeniedState =
  document.getElementById("accessDeniedState");

const errorState =
  document.getElementById("errorState");

const errorStateText =
  document.getElementById("errorStateText");

const errorRetryBtn =
  document.getElementById("errorRetryBtn");

const adminShell =
  document.getElementById("adminShell");

const adminNav =
  document.getElementById("adminNav");

const userName =
  document.getElementById("userName");

const userEmail =
  document.getElementById("userEmail");

const userAvatar =
  document.getElementById("userAvatar");

const hamburgerBtn =
  document.getElementById("hamburgerBtn");

const drawerOverlay =
  document.getElementById("drawerOverlay");

const profileBtn =
  document.getElementById("profileBtn");

const profileMenu =
  document.getElementById("profileMenu");

const logoutBtn =
  document.getElementById("logoutBtn");


/* ============================================================
   DASHBOARD REFS
   ============================================================ */

const usersCount =
  document.getElementById("usersCount");

const vendorsCount =
  document.getElementById("vendorsCount");

const ordersCount =
  document.getElementById("ordersCount");

const revenueTotal =
  document.getElementById("revenueTotal");


/* ============================================================
   NAVIGATION
   ============================================================ */

const NAV_ITEMS = [

  {
    id: "dashboard",
    label: "Dashboard",
    icon: "📊",
    permission: null,
    active: true
  },

  {
    id: "users",
    label: "Users",
    icon: "👥",
    permission: "users",
    ready: true
  },

  {
    id: "vendors",
    label: "Vendors",
    icon: "🏬",
    permission: "vendors",
    ready: true
  },

  {
    id: "products",
    label: "Products",
    icon: "📦",
    permission: "products",
    ready: true
  },

  {
    id: "orders",
    label: "Orders",
    icon: "🧾",
    permission: "orders",
    ready: true
  },

  {
    id: "payments",
    label: "Payments",
    icon: "💳",
    permission: "payments",
    ready: true
  },

  {
    id: "refunds",
    label: "Refunds",
    icon: "↩️",
    permission: "refunds",
    ready: true
  },

  {
    id: "wallets",
    label: "Wallets",
    icon: "👛",
    permission: "wallets",
    ready: true
  },

  {
    id: "withdrawals",
    label: "Withdrawals",
    icon: "🏧",
    permission: "wallets",
    ready: true
  },

  {
    id: "feedback",
    label: "Feedback",
    icon: "📝",
    permission: null,
    ready: true
  },

  {
    id: "alerts",
    label: "Activity",
    icon: "🔴",
    permission: null,
    ready: true
  },

  {
    id: "commissions",
    label: "Commissions",
    icon: "🧮",
    permission: "commissions",
    ready: true
  },

  {
    id: "cashback",
    label: "Cashback",
    icon: "💸",
    permission: "cashback",
    ready: true
  },

  {
    id: "referrals",
    label: "Referrals",
    icon: "🔗",
    permission: "referrals",
    ready: true
  },

  {
    id: "repairs",
    label: "Repairs",
    icon: "🔧",
    permission: "repairs",
    ready: true
  },

  {
    id: "chats",
    label: "Chats",
    icon: "💬",
    permission: "chats",
    ready: true
  },

  {
    id: "notifications",
    label: "Notifications",
    icon: "🔔",
    permission: "notifications",
    ready: true
  },

  {
    id: "reports",
    label: "Reports",
    icon: "📈",
    permission: "reports",
    ready: true
  },

  {
    id: "audit-log",
    label: "Audit Log",
    icon: "🗂️",
    permission: "auditLog",
    ready: true
  },

  {
    id: "settings",
    label: "Settings",
    icon: "⚙️",
    permission: "settings",
    ready: true
  }

];


/* ============================================================
   STATE HELPERS
   ============================================================ */

function hideAllStates() {

  [
    initialLoadingState,
    authRequiredState,
    accessDeniedState,
    errorState,
    adminShell
  ].forEach(el => {

    if (el) {
      el.classList.add("bf-hidden");
    }

  });

}


function showAuthRequired() {

  hideAllStates();

  authRequiredState.classList.remove(
    "bf-hidden"
  );

}


function showAccessDenied() {

  hideAllStates();

  accessDeniedState.classList.remove(
    "bf-hidden"
  );

}


function showError(message) {

  hideAllStates();

  errorStateText.textContent =
    message || "Please try again.";

  errorState.classList.remove(
    "bf-hidden"
  );

}


function showShell() {

  hideAllStates();

  adminShell.classList.remove(
    "bf-hidden"
  );

}


/* ============================================================
   RENDER NAVIGATION
   ============================================================ */

function renderNav(claims) {

  const hasGranularPermissions =
    claims &&
    claims.permissions &&
    typeof claims.permissions === "object";

  const isAllowed = (item) =>
    item.permission === null
      ? true
      : hasGranularPermissions
        ? claims.permissions[item.permission] === true
        : true;

  const vendorsItem = NAV_ITEMS.find(i => i.id === "vendors");
  const commissionsItem = NAV_ITEMS.find(i => i.id === "commissions");

  adminNav.innerHTML =
    NAV_ITEMS.map(item => {

      // "vendors" and "commissions" are rendered together as one
      // collapsible "Vendor" group instead of two flat items.
      if (item.id === "commissions") return "";

      if (item.id === "vendors") {

        if (!isAllowed(vendorsItem) && !isAllowed(commissionsItem)) return "";

        const currentPage = "index.html";
        const groupOpen = false; // dashboard is never vendors.html/commissions.html itself

        return `
          <div class="bf-admin-nav-group${groupOpen ? " open" : ""}">
            <button
              type="button"
              class="bf-admin-nav-item bf-admin-nav-group-toggle"
              data-nav-toggle="vendor-group">
              <span class="bf-admin-nav-icon">🏬</span>
              <span>Vendor</span>
              <span class="bf-admin-nav-caret">▾</span>
            </button>
            <div class="bf-admin-nav-submenu">
              ${isAllowed(vendorsItem) ? `
                <button type="button" class="bf-admin-nav-subitem" data-nav="vendors">
                  📋 <span>Applications &amp; Directory</span>
                </button>
              ` : ""}
              <button type="button" class="bf-admin-nav-subitem" data-nav="pending-products">
                🕓 <span>Pending Products</span>
              </button>
              ${isAllowed(commissionsItem) ? `
                <button type="button" class="bf-admin-nav-subitem" data-nav="commissions">
                  🧮 <span>Commissions</span>
                </button>
              ` : ""}
            </div>
          </div>
        `;

      }

      const allowed = isAllowed(item);

      if (!allowed) {
        return "";
      }


      const activeClass =
        item.active
          ? "bf-admin-nav-active"
          : "";

      const isReady =
        item.active || item.ready === true;


      return `

        <button
          type="button"
          class="bf-admin-nav-item ${activeClass}"
          data-nav="${item.id}">

          <span class="bf-admin-nav-icon">
            ${item.icon}
          </span>

          <span>
            ${item.label}
          </span>

          ${
            isReady
              ? ""
              : `<span class="bf-admin-nav-soon">
                   Soon
                 </span>`
          }

        </button>

      `;

    }).join("");

}


/* ============================================================
   DASHBOARD DATA
   ============================================================ */

async function loadDashboardMetrics() {

  try {

    /* ---------- USERS ---------- */

    const usersSnapshot =
      await getDocs(
        collection(db, "users")
      );


    usersCount.textContent =
      usersSnapshot.size;


    /* ---------- ORDERS ---------- */

    const ordersSnapshot =
      await getDocs(
        collection(db, "orders")
      );


    ordersCount.textContent =
      ordersSnapshot.size;


    /* ---------- VENDORS ---------- */

    const vendorsSnapshot =
      await getDocs(
        collection(db, "vendors")
      );


    vendorsCount.textContent =
      vendorsSnapshot.size;


    /* ---------- REVENUE ---------- */

    let revenue = 0;


    ordersSnapshot.forEach(orderDoc => {

      const orderData =
        orderDoc.data();


      const status =
        String(
          orderData.status || ""
        ).toLowerCase();


      if (status !== "delivered") {
        return;
      }


      const products =
        Array.isArray(orderData.products)
          ? orderData.products
          : [];


      products.forEach(product => {

        const price =
          Number(
            String(
              product.price || "0"
            )
            .replace(/[₹,\s]/g, "")
          );


        if (!Number.isNaN(price)) {

          revenue += price;

        }

      });

    });


    revenueTotal.textContent =
      "₹" +
      revenue.toLocaleString("en-IN");


    /* ---------- PENDING ORDERS ---------- */

    const pendingOrders = ordersSnapshot.docs.filter(d => {
      // normalizeOrderStatus maps early v2 values (PLACED, PROCESSING…)
      // onto the legacy ones; legacy values pass through unchanged.
      const s = String(normalizeOrderStatus(d.data().status) || "").toLowerCase();
      return s === "" || s === "pending" || s === "confirmed";
    }).length;

    const pendingOrdersEl = document.getElementById("pendingOrdersCount");
    if (pendingOrdersEl) pendingOrdersEl.textContent = pendingOrders;


    /* ---------- PENDING VENDOR PRODUCTS ---------- */

    try {
      const pendingProductsSnapshot = await getDocs(
        query(collection(db, "products"), where("approvalStatus", "==", "Pending"))
      );
      const pendingProductsEl = document.getElementById("pendingProductsCount");
      if (pendingProductsEl) pendingProductsEl.textContent = pendingProductsSnapshot.size;
    } catch (err) {
      console.error("Pending products metric error:", err);
    }


    /* ---------- RECENT ORDERS ---------- */

    const recentOrdersEl = document.getElementById("recentOrdersList");
    if (recentOrdersEl) {

      const sorted = ordersSnapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
          const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
          return tb - ta;
        })
        .slice(0, 5);

      recentOrdersEl.innerHTML = sorted.length
        ? sorted.map(o => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--line);">
              <div>
                <div style="font-weight:700;font-size:13px;">#${o.orderNumber || o.id.slice(0, 8).toUpperCase()} — ${(o.customerName || "Customer")}</div>
                <div style="font-size:11px;opacity:.6;">₹${o.total || 0}</div>
              </div>
              <span class="bf-status-pill bf-status-pending" style="font-size:10px;">${normalizeOrderStatus(o.status) || "Pending"}</span>
            </div>
          `).join("")
        : `<div style="padding:10px 0;opacity:.6;font-size:13px;">No orders yet.</div>`;

    }


    console.log(
      "Dashboard loaded:",
      {
        users: usersSnapshot.size,
        vendors: vendorsSnapshot.size,
        orders: ordersSnapshot.size,
        revenue: revenue
      }
    );


  } catch (error) {

    console.error(
      "Dashboard metrics error:",
      error
    );


    if (usersCount) {
      usersCount.textContent = "—";
    }

    if (vendorsCount) {
      vendorsCount.textContent = "—";
    }

    if (ordersCount) {
      ordersCount.textContent = "—";
    }

    if (revenueTotal) {
      revenueTotal.textContent = "—";
    }


    showToast(
      "Unable to load dashboard data",
      "danger"
    );

  }

}


/* ============================================================
   DRAWER
   ============================================================ */

function openDrawer() {

  adminShell.classList.add(
    "bf-admin-drawer-open"
  );

  hamburgerBtn.setAttribute(
    "aria-expanded",
    "true"
  );

}


function closeDrawer() {

  adminShell.classList.remove(
    "bf-admin-drawer-open"
  );

  hamburgerBtn.setAttribute(
    "aria-expanded",
    "false"
  );

}


hamburgerBtn.addEventListener(
  "click",
  () => {

    const isOpen =
      adminShell.classList.contains(
        "bf-admin-drawer-open"
      );


    if (isOpen) {

      closeDrawer();

    } else {

      openDrawer();

    }

  }
);


drawerOverlay.addEventListener(
  "click",
  closeDrawer
);


window.addEventListener(
  "resize",
  () => {

    if (window.innerWidth >= 1024) {
      closeDrawer();
    }

  }
);


/* ============================================================
   PROFILE MENU
   ============================================================ */

profileBtn.addEventListener(
  "click",
  e => {

    e.stopPropagation();


    const isOpen =
      !profileMenu.classList.contains(
        "bf-hidden"
      );


    profileMenu.classList.toggle(
      "bf-hidden",
      isOpen
    );


    profileBtn.setAttribute(
      "aria-expanded",
      String(!isOpen)
    );

  }
);


document.addEventListener(
  "click",
  e => {

    if (
      !profileMenu.contains(e.target) &&
      e.target !== profileBtn
    ) {

      profileMenu.classList.add(
        "bf-hidden"
      );

      profileBtn.setAttribute(
        "aria-expanded",
        "false"
      );

    }

  }
);


/* ============================================================
   LOGOUT
   ============================================================ */

logoutBtn.addEventListener(
  "click",
  async () => {

    logoutBtn.disabled = true;


    try {

      await signOut(auth);


      showToast(
        "Logged out successfully",
        "success"
      );


      window.location.href =
        "../login.html";


    } catch (error) {

      logoutBtn.disabled = false;


      showToast(
        error.message ||
        "Logout failed",
        "danger"
      );

    }

  }
);


/* ============================================================
   NAVIGATION CLICK
   ============================================================ */

adminNav.addEventListener(
  "click",
  e => {

    const toggleBtn =
      e.target.closest(
        "[data-nav-toggle]"
      );

    if (toggleBtn) {
      toggleBtn.closest(".bf-admin-nav-group").classList.toggle("open");
      return;
    }

    const btn =
      e.target.closest(
        ".bf-admin-nav-item, .bf-admin-nav-subitem"
      );


    if (!btn) {
      return;
    }


    const navId =
      btn.dataset.nav;


    /* ---------- USERS ---------- */

    if (navId === "users") {

      window.location.href =
        "users.html";

      return;

    }


    /* ---------- PRODUCTS ---------- */

    if (navId === "products") {

      window.location.href =
        "products.html";

      return;

    }


    /* ---------- ORDERS ---------- */

    if (navId === "orders") {

      window.location.href =
        "orders.html";

      return;

    }


    /* ---------- VENDORS ---------- */

    if (navId === "vendors") {

      window.location.href =
        "vendors.html";

      return;

    }


    /* ---------- PAYMENTS & REFUNDS ---------- */

    if (navId === "payments") {

      window.location.href =
        "payments.html";

      return;

    }

    if (navId === "refunds") {

      window.location.href =
        "payments.html#refunds";

      return;

    }


    /* ---------- WALLETS ---------- */

    if (navId === "wallets") {

      window.location.href =
        "wallets.html";

      return;

    }


    /* ---------- WITHDRAWALS ---------- */

    if (navId === "withdrawals") {

      window.location.href =
        "withdrawals.html";

      return;

    }


    /* ---------- FEEDBACK ---------- */

    if (navId === "feedback") {

      window.location.href =
        "feedback.html";

      return;

    }


    /* ---------- PENDING PRODUCTS ---------- */

    if (navId === "pending-products") {

      window.location.href =
        "pending-products.html";

      return;

    }


    /* ---------- ACTIVITY / ALERTS ---------- */

    if (navId === "alerts") {

      window.location.href =
        "alerts.html";

      return;

    }


    /* ---------- COMMISSIONS ---------- */

    if (navId === "commissions") {

      window.location.href =
        "commissions.html";

      return;

    }


    /* ---------- CASHBACK ---------- */

    if (navId === "cashback") {

      window.location.href =
        "cashback.html";

      return;

    }


    /* ---------- REFERRALS ---------- */

    if (navId === "referrals") {

      window.location.href =
        "referrals.html";

      return;

    }


    /* ---------- REPAIRS ---------- */

    if (navId === "repairs") {

      window.location.href =
        "repairs.html";

      return;

    }


    /* ---------- CHATS ---------- */

    if (navId === "chats") {

      window.location.href =
        "chats.html";

      return;

    }


    /* ---------- DASHBOARD ---------- */

    if (navId === "dashboard") {

      closeDrawer();

      return;

    }


    /* ---------- NOTIFICATIONS ---------- */

    if (navId === "notifications") {

      window.location.href =
        "notifications.html";

      return;

    }


    /* ---------- REPORTS ---------- */

    if (navId === "reports") {

      window.location.href =
        "reports.html";

      return;

    }


    /* ---------- AUDIT LOG ---------- */

    if (navId === "audit-log") {

      window.location.href =
        "audit-log.html";

      return;

    }


    /* ---------- SETTINGS ---------- */

    if (navId === "settings") {

      window.location.href =
        "settings.html";

      return;

    }


    /* ---------- OTHER SECTIONS ---------- */

    showToast(
      "This section is coming soon",
      "info"
    );


    closeDrawer();

  }
);


/* ============================================================
   RETRY
   ============================================================ */

errorRetryBtn.addEventListener(
  "click",
  () => {

    window.location.reload();

  }
);


/* ============================================================
   AUTH GUARD
   ============================================================ */

onAuthStateChanged(
  auth,
  async user => {

    /* ---------- NOT LOGGED IN ---------- */

    if (!user) {

      showAuthRequired();

      return;

    }


    try {

      /*
        Force refresh to get latest
        Firebase custom claims.
      */

      const tokenResult =
        await user.getIdTokenResult(
          true
        );


      const claims =
        tokenResult.claims || {};


      /* ---------- ADMIN CHECK ---------- */

      if (claims.admin !== true) {

        showAccessDenied();

        return;

      }


      /* ---------- USER INFO ---------- */

      const displayName =
        user.displayName ||
        (
          user.email
            ? user.email.split("@")[0]
            : "Admin"
        );


      userName.textContent =
        displayName;


      userEmail.textContent =
        user.email || "";


      userAvatar.textContent =
        displayName
          .charAt(0)
          .toUpperCase();


      /* ---------- NAVIGATION ---------- */

      renderNav(claims);


      /* ---------- SHOW ADMIN ---------- */

      showShell();


      /* ---------- LOAD DATA ---------- */

      await loadDashboardMetrics();


    } catch (error) {

      console.error(
        "Admin verification error:",
        error
      );


      showError(
        "We couldn't verify your admin access. Please try again."
      );

    }

  }
);
