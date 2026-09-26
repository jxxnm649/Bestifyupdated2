import { auth, db } from "../firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import {
  openModal,
  closeModal,
  showToast
} from "../design-system.js";

import { logAdminAction } from "./audit.js";
import { normalizeOrder } from "../order-compat.js";


const usersList = document.getElementById("usersList");
const userCount = document.getElementById("userCount");
const userSearch = document.getElementById("userSearch");
const userDetailsModal = document.getElementById("userDetailsModal");
const userDetailsContent = document.getElementById("userDetailsContent");
const userDetailsCloseBtn = document.getElementById("userDetailsCloseBtn");
const orderDetailsModal = document.getElementById("orderDetailsModal");
const orderDetailsContent = document.getElementById("orderDetailsContent");
const orderDetailsCloseBtn = document.getElementById("orderDetailsCloseBtn");

let allUsers = [];
let currentDetailsUserId = null;
let currentOrdersState = { uid: null, status: "idle", orders: [] };
let orderSearchTerm = "";
let orderStatusFilter = "All Status";


/* =========================
   LOAD USERS
========================= */

async function loadUsers() {

  try {

    const snapshot =
      await getDocs(
        collection(db, "users")
      );

    allUsers = [];

    snapshot.forEach(doc => {

      allUsers.push({
        id: doc.id,
        ...doc.data()
      });

    });

    userCount.textContent =
      `Total Users: ${allUsers.length}`;

    renderUsers(allUsers);

  } catch (error) {

    console.error(
      "Users loading error:",
      error
    );

    usersList.innerHTML = `
      <div class="bf-card" style="padding:20px;">
        ❌ Unable to load users.
      </div>
    `;

  }

}


/* =========================
   RENDER USERS
========================= */

function renderUsers(users) {

  if (!users.length) {

    usersList.innerHTML = `
      <div class="bf-card" style="padding:20px;">
        No users found.
      </div>
    `;

    return;
  }


  usersList.innerHTML = users.map(user => {

    const name =
      user.name ||
      user.fullName ||
      user.displayName ||
      "Unnamed User";

    const email =
      user.email ||
      "No email";

    const phone =
      user.phone ||
      user.mobile ||
      "No phone";

    const isBlocked = user.blocked === true;

    return `

      <div
        class="bf-card"
        style="
          padding:18px;
          margin-bottom:12px;
        ">

        <div style="
          display:flex;
          justify-content:space-between;
          gap:15px;
          align-items:flex-start;
        ">

          <div>

            <div style="
              font-size:18px;
              font-weight:700;
              margin-bottom:6px;
            ">
              👤 ${escapeHtml(name)}
            </div>

            <div style="margin-bottom:4px;">
              📧 ${escapeHtml(email)}
            </div>

            <div style="margin-bottom:4px;">
              📱 ${escapeHtml(phone)}
            </div>

            <div style="
              font-size:12px;
              opacity:.65;
              word-break:break-all;
            ">
              UID: ${escapeHtml(user.id)}
            </div>

          </div>

          <span style="
            padding:5px 10px;
            border-radius:20px;
            background:${isBlocked ? "#fdecea" : "#e8f5e9"};
            color:${isBlocked ? "#c62828" : "#2e7d32"};
            font-size:12px;
            white-space:nowrap;
          ">
            ${isBlocked ? "Blocked" : "Active"}
          </span>

        </div>

        <div style="margin-top:14px; display:flex; gap:8px; flex-wrap:wrap;">
          <button
            type="button"
            class="bf-btn bf-btn-ghost bf-btn-sm view-details-btn"
            data-uid="${escapeHtml(user.id)}">
            View Details
          </button>

          <button
            type="button"
            class="bf-btn bf-btn-ghost bf-btn-sm toggle-block-btn"
            data-uid="${escapeHtml(user.id)}"
            data-blocked="${isBlocked}">
            ${isBlocked ? "Unblock" : "Block"}
          </button>

          <button
            type="button"
            class="bf-btn bf-btn-ghost bf-btn-sm delete-user-btn"
            data-uid="${escapeHtml(user.id)}"
            data-name="${escapeHtml(name)}"
            style="color:#c62828;">
            Delete
          </button>
        </div>

      </div>

    `;

  }).join("");

}


/* =========================
   USER DETAILS MODAL & HELPERS
========================= */

const DETAILS_HANDLED_KEYS = new Set([
  "name", "fullName", "displayName",
  "email",
  "phone", "mobile", "secondaryPhone",
  "gender", "dob", "work",
  "address", "district", "city", "state", "country", "pincode",
  "active", "isActive", "status", "disabled", "blocked",
  "createdAt", "created_at", "createdOn", "dateCreated"
]);

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function formatFieldLabel(key) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, s => s.toUpperCase());
}

function formatDateValue(value) {
  if (value && typeof value.toDate === "function") {
    return value.toDate().toLocaleString();
  }
  if (value instanceof Date) {
    return value.toLocaleString();
  }
  return String(value);
}

function getAccountStatus(user) {
  if (user.blocked === true) return "Blocked";
  if (typeof user.active === "boolean") return user.active ? "Active" : "Inactive";
  if (typeof user.status === "string" && user.status.trim() !== "") return user.status;
  if (typeof user.isActive === "boolean") return user.isActive ? "Active" : "Inactive";
  return "Active";
}

function getCreatedDate(user) {
  const value = user.createdAt || user.created_at || user.createdOn || user.dateCreated;
  if (!value) return "Not available";
  try {
    return formatDateValue(value);
  } catch {
    return "Not available";
  }
}

function detailRow(label, value) {
  return `
    <div style="
      display:flex;
      justify-content:space-between;
      gap:12px;
      padding:10px 0;
      border-bottom:1px solid var(--line, #eee);
    ">
      <span style="font-weight:600;color:var(--ink-soft, #555);">${escapeHtml(label)}</span>
      <span style="text-align:right;word-break:break-word;">${escapeHtml(value)}</span>
    </div>
  `;
}

function renderUserDetails(user) {
  const name = user.name || user.fullName || user.displayName || "";
  const email = user.email || "Not available";
  const mobile = user.mobile || user.phone || "";
  const secondaryPhone = user.secondaryPhone || "";
  const gender = user.gender || "";
  const dob = user.dob || "";
  const work = user.work || "";
  const address = user.address || "";
  const district = user.district || "";
  const city = user.city || "";
  const state = user.state || "";
  const country = user.country || "";
  const pincode = user.pincode || "";
  const isBlocked = user.blocked === true;

  const rows = [
    detailRow("Email", email),
    detailRow("UID", user.id),
    detailRow("Account status", getAccountStatus(user)),
    detailRow("Created date", getCreatedDate(user)),
  ];

  Object.keys(user)
    .filter(key => key !== "id" && !DETAILS_HANDLED_KEYS.has(key))
    .forEach(key => {
      const raw = user[key];
      const value = (raw === null || raw === undefined || raw === "")
        ? "Not available"
        : (typeof raw === "object" ? JSON.stringify(raw) : String(raw));
      rows.push(detailRow(formatFieldLabel(key), value));
    });

  userDetailsContent.innerHTML = `
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px;">
      <button
        type="button"
        id="toggleBlockDetailBtn"
        class="bf-btn ${isBlocked ? "bf-btn-primary" : "bf-btn-ghost"} bf-btn-sm"
        data-blocked="${isBlocked}">
        ${isBlocked ? "Unblock User" : "Block User"}
      </button>

      <button
        type="button"
        id="deleteUserDetailBtn"
        class="bf-btn bf-btn-ghost bf-btn-sm"
        style="color:#c62828;">
        Delete Customer
      </button>
    </div>

    <div style="margin-bottom:20px;">
      <h3 style="font-size:15px;margin:0 0 10px;">✏️ Edit Details</h3>

      <div class="bf-field" style="margin-bottom:10px;">
        <label class="bf-label">Name</label>
        <input type="text" id="editUserName" class="bf-input" value="${escapeHtml(name)}" placeholder="Full name">
      </div>

      <div class="bf-field" style="margin-bottom:10px;">
        <label class="bf-label">Mobile Number</label>
        <input type="text" id="editUserMobile" class="bf-input" value="${escapeHtml(mobile)}" placeholder="Mobile number">
      </div>

      <div class="bf-field" style="margin-bottom:10px;">
        <label class="bf-label">Secondary Phone</label>
        <input type="text" id="editUserSecondaryPhone" class="bf-input" value="${escapeHtml(secondaryPhone)}" placeholder="Alternate number">
      </div>

      <div class="bf-field" style="margin-bottom:10px;">
        <label class="bf-label">Gender</label>
        <select id="editUserGender" class="bf-select">
          <option value="" ${!gender ? "selected" : ""}>Select</option>
          <option value="Male" ${gender === "Male" ? "selected" : ""}>Male</option>
          <option value="Female" ${gender === "Female" ? "selected" : ""}>Female</option>
          <option value="Other" ${gender === "Other" ? "selected" : ""}>Other</option>
          <option value="Prefer not to say" ${gender === "Prefer not to say" ? "selected" : ""}>Prefer not to say</option>
        </select>
      </div>

      <div class="bf-field" style="margin-bottom:10px;">
        <label class="bf-label">Date of Birth</label>
        <input type="date" id="editUserDob" class="bf-input" value="${escapeHtml(dob)}">
      </div>

      <div class="bf-field" style="margin-bottom:10px;">
        <label class="bf-label">Work / Occupation</label>
        <input type="text" id="editUserWork" class="bf-input" value="${escapeHtml(work)}" placeholder="Occupation">
      </div>

      <div class="bf-field" style="margin-bottom:10px;">
        <label class="bf-label">Address</label>
        <textarea id="editUserAddress" class="bf-input" rows="2" placeholder="Address">${escapeHtml(address)}</textarea>
      </div>

      <div class="bf-field" style="margin-bottom:10px;">
        <label class="bf-label">District</label>
        <input type="text" id="editUserDistrict" class="bf-input" value="${escapeHtml(district)}">
      </div>

      <div style="display:flex;gap:8px;">
        <div class="bf-field" style="margin-bottom:10px;flex:1;">
          <label class="bf-label">City</label>
          <input type="text" id="editUserCity" class="bf-input" value="${escapeHtml(city)}">
        </div>
        <div class="bf-field" style="margin-bottom:10px;flex:1;">
          <label class="bf-label">State</label>
          <input type="text" id="editUserState" class="bf-input" value="${escapeHtml(state)}">
        </div>
      </div>

      <div style="display:flex;gap:8px;">
        <div class="bf-field" style="margin-bottom:10px;flex:1;">
          <label class="bf-label">Country</label>
          <input type="text" id="editUserCountry" class="bf-input" value="${escapeHtml(country)}">
        </div>
        <div class="bf-field" style="margin-bottom:10px;flex:1;">
          <label class="bf-label">Pin Code</label>
          <input type="text" id="editUserPincode" class="bf-input" value="${escapeHtml(pincode)}" maxlength="6">
        </div>
      </div>

      <button
        type="button"
        id="saveUserEditBtn"
        class="bf-btn bf-btn-primary bf-btn-sm">
        Save Changes
      </button>
    </div>

    <div style="margin-bottom:16px;">
      ${rows.join("")}
    </div>

    <div style="margin-top:24px;">
      <h3 style="font-size:15px;margin:0 0 10px;">📦 Order History</h3>

      <div id="userOrdersSummary" style="margin-bottom:12px;">
        ${renderOrdersSummaryHTML()}
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px;">
        <input
          type="search"
          id="orderSearchInput"
          class="bf-input"
          placeholder="Search orders..."
          value="${escapeHtml(orderSearchTerm)}"
          style="flex:1; min-width:160px;">

        <select id="orderStatusFilterSelect" class="bf-select" style="max-width:170px;">
          <option value="All Status" ${orderStatusFilter === "All Status" ? "selected" : ""}>All Status</option>
          ${ORDER_STATUS_OPTIONS.map(opt =>
            `<option value="${opt}" ${orderStatusFilter === opt ? "selected" : ""}>${opt}</option>`
          ).join("")}
        </select>
      </div>

      <div id="userOrdersList">
        ${renderOrdersSectionHTML(user.id)}
      </div>
    </div>
  `;
}

function renderOrdersSummaryHTML() {
  if (currentOrdersState.status !== "success") {
    return "";
  }

  const orders = currentOrdersState.orders;
  const totalOrders = orders.length;
  const totalSpent = orders.reduce((sum, o) => {
    const amt = Number(o.total ?? o.totalPrice ?? 0);
    return sum + (isNaN(amt) ? 0 : amt);
  }, 0);

  return `
    <div style="display:flex; gap:16px; flex-wrap:wrap;">
      <div class="bf-card" style="padding:12px 16px;">
        <div style="font-size:12px; opacity:.65;">Total Orders</div>
        <div style="font-size:18px; font-weight:700;">${totalOrders}</div>
      </div>
      <div class="bf-card" style="padding:12px 16px;">
        <div style="font-size:12px; opacity:.65;">Total Spent</div>
        <div style="font-size:18px; font-weight:700;">₹${totalSpent.toLocaleString("en-IN")}</div>
      </div>
    </div>
  `;
}


/* =========================
   USER ORDERS LOGIC
========================= */

const ORDER_STATUS_OPTIONS = ["Pending", "Confirmed", "Packed", "Shipped", "Delivered", "Cancelled"];
const PAYMENT_STATUS_OPTIONS = ["Pending", "Paid", "Failed", "Refunded"];

async function loadUserOrders(uid) {
  currentOrdersState = { uid, status: "loading", orders: [] };
  updateOrdersContainer();

  try {
    const q = query(collection(db, "orders"), where("userId", "==", uid));
    const snapshot = await getDocs(q);

    const orders = [];
    snapshot.forEach(doc => {
      orders.push(normalizeOrder({ id: doc.id, ...doc.data() }));
    });

    currentOrdersState = { uid, status: "success", orders };
    updateOrdersContainer();
  } catch (error) {
    console.error("Orders load error:", error);
    currentOrdersState = { uid, status: "error", orders: [] };
    updateOrdersContainer();
  }
}

function getOrderStatusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("cancel")) return "bf-status-danger";
  if (s.includes("deliver")) return "bf-status-success";
  if (s.includes("ship") || s.includes("out for delivery")) return "bf-status-progress";
  if (s.includes("confirm") || s.includes("pack")) return "bf-status-warning";
  return "bf-status-pending";
}

function renderOrderRow(order) {
  const shortId = String(order.id).slice(0, 8).toUpperCase();
  const amount = order.total ?? order.totalPrice ?? "Not available";

  const productName = Array.isArray(order.products) && order.products.length
    ? order.products.map(p => p.productName || "Product").join(", ")
    : "Not available";

  const status = order.status || "Not available";
  const date = getCreatedDate(order);

  return `
    <div class="bf-card" style="padding:14px; margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
        <span style="font-weight:700; font-size:13px;">#${escapeHtml(shortId)}</span>
        <span class="bf-status-pill ${getOrderStatusClass(status)}">${escapeHtml(status)}</span>
      </div>
      <p style="margin:8px 0 4px; font-size:14px;">${escapeHtml(productName)}</p>
      <div style="display:flex; justify-content:space-between; font-size:13px; color:var(--ink-soft, #555);">
        <span>${amount === "Not available" ? "Not available" : "₹" + escapeHtml(String(amount))}</span>
        <span>${escapeHtml(date)}</span>
      </div>
      <div style="margin-top:10px;">
        <button
          type="button"
          class="bf-btn bf-btn-ghost bf-btn-sm view-order-btn"
          data-order-id="${escapeHtml(order.id)}">
          View Order
        </button>
      </div>
    </div>
  `;
}

function getFilteredOrders() {
  let list = currentOrdersState.orders;

  if (orderStatusFilter !== "All Status") {
    list = list.filter(o => o.status === orderStatusFilter);
  }

  const term = orderSearchTerm.trim().toLowerCase();
  if (term) {
    list = list.filter(o => {
      const productNames = Array.isArray(o.products)
        ? o.products.map(p => p.productName || "").join(" ")
        : "";
      const searchable = `
        ${o.id || ""}
        ${productNames}
        ${o.customerName || ""}
        ${o.mobile || o.phone || ""}
      `.toLowerCase();
      return searchable.includes(term);
    });
  }

  return list;
}

function renderOrdersSectionHTML(uid) {
  if (currentOrdersState.uid !== uid || currentOrdersState.status === "loading") {
    return `<p class="bf-state-text">Loading orders...</p>`;
  }

  if (currentOrdersState.status === "error") {
    return `<p class="bf-state-text">⚠️ Unable to load orders. Please try again.</p>`;
  }

  const filtered = getFilteredOrders();

  if (!filtered.length) {
    return `<p class="bf-state-text">No orders found</p>`;
  }

  return filtered.map(renderOrderRow).join("");
}

function updateOrdersContainer() {
  const container = document.getElementById("userOrdersList");
  if (container) container.innerHTML = renderOrdersSectionHTML(currentDetailsUserId);

  const summary = document.getElementById("userOrdersSummary");
  if (summary) summary.innerHTML = renderOrdersSummaryHTML();
}

const ORDER_HANDLED_KEYS = new Set([
  "userId", "mobile", "phone", "address", "products",
  "total", "totalPrice", "status", "paymentStatus",
  "createdAt", "updatedAt", "modifiedAt", "cancelledAt"
]);

function renderOrderDetails(order) {
  const rows = [
    detailRow("Order ID", order.id),
    detailRow("Customer/User ID", order.userId || "Not available"),
  ];

  if (Array.isArray(order.products) && order.products.length) {
    order.products.forEach((product, index) => {
      const suffix = order.products.length > 1 ? ` (Item ${index + 1})` : "";
      rows.push(detailRow(`Product name${suffix}`, product.productName || "Not available"));
      rows.push(detailRow(`Quantity${suffix}`, product.qty !== undefined ? String(product.qty) : "Not available"));
      rows.push(detailRow(`Price${suffix}`, product.price !== undefined ? `₹${product.price}` : "Not available"));
    });
  } else {
    rows.push(detailRow("Product name", "Not available"));
    rows.push(detailRow("Quantity", "Not available"));
    rows.push(detailRow("Price", "Not available"));
  }

  const total = order.total ?? order.totalPrice;
  rows.push(detailRow("Total amount", total !== undefined ? `₹${total}` : "Not available"));
  rows.push(detailRow("Order status", order.status || "Not available"));
  rows.push(detailRow("Payment status", order.paymentStatus || "Not available"));
  rows.push(detailRow("Delivery address", order.address || "Not available"));
  rows.push(detailRow("Phone", order.mobile || order.phone || "Not available"));
  rows.push(detailRow("Created date", getCreatedDate(order)));

  Object.keys(order)
    .filter(key => key !== "id" && !ORDER_HANDLED_KEYS.has(key))
    .forEach(key => {
      const raw = order[key];
      let value = (raw === null || raw === undefined || raw === "") ? "Not available" : String(raw);
      rows.push(detailRow(formatFieldLabel(key), value));
    });

  orderDetailsContent.innerHTML = `
    ${rows.join("")}
    <div class="bf-field" style="margin-top:16px;">
      <label class="bf-label">Update Order Status</label>
      <select class="bf-select" id="orderStatusSelect">
        ${ORDER_STATUS_OPTIONS.map(opt =>
          `<option value="${opt}" ${order.status === opt ? "selected" : ""}>${opt}</option>`
        ).join("")}
      </select>
    </div>
    <div style="margin-top:10px;">
      <button
        type="button"
        class="bf-btn bf-btn-primary bf-btn-sm"
        id="saveOrderStatusBtn"
        data-order-id="${escapeHtml(order.id)}">
        Save Status
      </button>
    </div>

    <div class="bf-field" style="margin-top:16px;">
      <label class="bf-label">Update Payment Status</label>
      <select class="bf-select" id="paymentStatusSelect">
        ${PAYMENT_STATUS_OPTIONS.map(opt =>
          `<option value="${opt}" ${(order.paymentStatus || PAYMENT_STATUS_OPTIONS[0]) === opt ? "selected" : ""}>${opt}</option>`
        ).join("")}
      </select>
    </div>
    <div style="margin-top:10px;">
      <button
        type="button"
        class="bf-btn bf-btn-primary bf-btn-sm"
        id="savePaymentStatusBtn"
        data-order-id="${escapeHtml(order.id)}">
        Save Payment Status
      </button>
    </div>
  `;
}

async function saveOrderStatus(orderId) {
  const select = document.getElementById("orderStatusSelect");
  const saveBtn = document.getElementById("saveOrderStatusBtn");
  if (!select || !saveBtn) return;

  const newStatus = select.value;
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  try {
    await updateDoc(doc(db, "orders", orderId), { status: newStatus });

    await logAdminAction("Updated order status", "Users", { orderId, newStatus });

    const orderIndex = currentOrdersState.orders.findIndex(o => o.id === orderId);
    if (orderIndex !== -1) {
      currentOrdersState.orders[orderIndex].status = newStatus;
    }

    showToast("Order status updated successfully", "success");
    if (currentOrdersState.orders[orderIndex]) {
      renderOrderDetails(currentOrdersState.orders[orderIndex]);
    }
    updateOrdersContainer();
  } catch (error) {
    console.error("Order status update error:", error);
    showToast(error.message || "Failed to update order status.", "danger");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Status";
  }
}

async function savePaymentStatus(orderId) {
  const select = document.getElementById("paymentStatusSelect");
  const saveBtn = document.getElementById("savePaymentStatusBtn");
  if (!select || !saveBtn) return;

  const newPaymentStatus = select.value;
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  try {
    await updateDoc(doc(db, "orders", orderId), { paymentStatus: newPaymentStatus });

    await logAdminAction("Updated payment status", "Users", { orderId, newPaymentStatus });

    const orderIndex = currentOrdersState.orders.findIndex(o => o.id === orderId);
    if (orderIndex !== -1) {
      currentOrdersState.orders[orderIndex].paymentStatus = newPaymentStatus;
    }

    showToast("Payment status updated successfully", "success");
    if (currentOrdersState.orders[orderIndex]) {
      renderOrderDetails(currentOrdersState.orders[orderIndex]);
    }
    updateOrdersContainer();
  } catch (error) {
    console.error("Payment status update error:", error);
    showToast(error.message || "Failed to update payment status.", "danger");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Payment Status";
  }
}


/* =========================
   EVENT LISTENERS & INIT
========================= */

// User Search Filter
if (userSearch) {
  userSearch.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase().trim();
    const filtered = allUsers.filter(u => {
      const name = (u.name || u.fullName || u.displayName || "").toLowerCase();
      const email = (u.email || "").toLowerCase();
      const phone = (u.phone || u.mobile || "").toLowerCase();
      return name.includes(term) || email.includes(term) || phone.includes(term);
    });
    renderUsers(filtered);
  });
}

// User List Click Handling (View Details)
if (usersList) {
  usersList.addEventListener("click", (e) => {
    const btn = e.target.closest(".view-details-btn");
    if (btn) {
      const uid = btn.dataset.uid;
      const user = allUsers.find(u => u.id === uid);
      if (user) {
        currentDetailsUserId = uid;
        renderUserDetails(user);
        openModal("userDetailsModal");
        loadUserOrders(uid);
      }
    }
  });
}

// Order Details Modal Click Handling (View Order & Save Status)
if (userDetailsContent) {
  userDetailsContent.addEventListener("click", (e) => {
    const btn = e.target.closest(".view-order-btn");
    if (btn) {
      const orderId = btn.dataset.orderId;
      const order = currentOrdersState.orders.find(o => o.id === orderId);
      if (order) {
        renderOrderDetails(order);
        openModal("orderDetailsModal");
      }
    }
  });

  userDetailsContent.addEventListener("input", (e) => {
    if (e.target.id === "orderSearchInput") {
      orderSearchTerm = e.target.value;
      updateOrdersContainer();
    }
  });

  userDetailsContent.addEventListener("change", (e) => {
    if (e.target.id === "orderStatusFilterSelect") {
      orderStatusFilter = e.target.value;
      updateOrdersContainer();
    }
  });
}

if (orderDetailsContent) {
  orderDetailsContent.addEventListener("click", (e) => {
    if (e.target.id === "saveOrderStatusBtn") {
      const orderId = e.target.dataset.orderId;
      saveOrderStatus(orderId);
    }
    if (e.target.id === "savePaymentStatusBtn") {
      const orderId = e.target.dataset.orderId;
      savePaymentStatus(orderId);
    }
  });
}

// Modal Close Buttons
if (userDetailsCloseBtn) {
  userDetailsCloseBtn.addEventListener("click", () => closeModal("userDetailsModal"));
}

if (orderDetailsCloseBtn) {
  orderDetailsCloseBtn.addEventListener("click", () => closeModal("orderDetailsModal"));
}

// Block/Unblock & Delete (quick actions on list + inside modal)
if (usersList) {
  usersList.addEventListener("click", (e) => {
    const blockBtn = e.target.closest(".toggle-block-btn");
    if (blockBtn) {
      toggleBlockUser(blockBtn.dataset.uid, blockBtn.dataset.blocked === "true");
      return;
    }
    const deleteBtn = e.target.closest(".delete-user-btn");
    if (deleteBtn) {
      deleteUser(deleteBtn.dataset.uid, deleteBtn.dataset.name || "this user");
    }
  });
}

if (userDetailsContent) {
  userDetailsContent.addEventListener("click", (e) => {
    if (e.target.id === "saveUserEditBtn") {
      saveUserEdits(currentDetailsUserId);
    }
    const blockBtn = e.target.closest("#toggleBlockDetailBtn");
    if (blockBtn) {
      toggleBlockUser(currentDetailsUserId, blockBtn.dataset.blocked === "true");
    }
    if (e.target.id === "deleteUserDetailBtn") {
      const user = allUsers.find(u => u.id === currentDetailsUserId);
      deleteUser(currentDetailsUserId, (user && (user.name || user.fullName || user.email)) || "this user");
    }
  });
}


/* =========================
   EDIT / BLOCK / DELETE ACTIONS
========================= */

async function saveUserEdits(uid) {
  const saveBtn = document.getElementById("saveUserEditBtn");
  if (!uid || !saveBtn) return;

  const updates = {
    name: document.getElementById("editUserName").value.trim(),
    mobile: document.getElementById("editUserMobile").value.trim(),
    secondaryPhone: document.getElementById("editUserSecondaryPhone").value.trim(),
    gender: document.getElementById("editUserGender").value,
    dob: document.getElementById("editUserDob").value,
    work: document.getElementById("editUserWork").value.trim(),
    address: document.getElementById("editUserAddress").value.trim(),
    district: document.getElementById("editUserDistrict").value.trim(),
    city: document.getElementById("editUserCity").value.trim(),
    state: document.getElementById("editUserState").value.trim(),
    country: document.getElementById("editUserCountry").value.trim(),
    pincode: document.getElementById("editUserPincode").value.trim()
  };

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  try {
    await updateDoc(doc(db, "users", uid), updates);

    await logAdminAction("Updated user profile", "Users", { uid, ...updates });

    const idx = allUsers.findIndex(u => u.id === uid);
    if (idx !== -1) {
      allUsers[idx] = { ...allUsers[idx], ...updates };
      renderUserDetails(allUsers[idx]);
      renderUsers(allUsers);
    }

    showToast("User details updated", "success");
  } catch (error) {
    console.error("User update error:", error);
    showToast(error.message || "Failed to update user.", "danger");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Changes";
  }
}

async function toggleBlockUser(uid, isCurrentlyBlocked) {
  if (!uid) return;

  const nextBlocked = !isCurrentlyBlocked;
  const confirmMsg = nextBlocked
    ? "Block this user? They will no longer be able to log in."
    : "Unblock this user and restore their access?";
  if (!window.confirm(confirmMsg)) return;

  try {
    await updateDoc(doc(db, "users", uid), { blocked: nextBlocked });

    await logAdminAction(nextBlocked ? "Blocked user" : "Unblocked user", "Users", { uid });

    const idx = allUsers.findIndex(u => u.id === uid);
    if (idx !== -1) {
      allUsers[idx] = { ...allUsers[idx], blocked: nextBlocked };
      renderUsers(allUsers);
      if (currentDetailsUserId === uid) {
        renderUserDetails(allUsers[idx]);
      }
    }

    showToast(nextBlocked ? "User blocked" : "User unblocked", "success");
  } catch (error) {
    console.error("Block/unblock error:", error);
    showToast(error.message || "Failed to update user status.", "danger");
  }
}

async function deleteUser(uid, label) {
  if (!uid) return;

  const sure = window.confirm(
    `Delete ${label}? This removes their profile and order history access from Bestify. This cannot be undone.`
  );
  if (!sure) return;

  try {
    await deleteDoc(doc(db, "users", uid));

    await logAdminAction("Deleted user", "Users", { uid, label });

    allUsers = allUsers.filter(u => u.id !== uid);
    renderUsers(allUsers);
    userCount.textContent = `Total Users: ${allUsers.length}`;

    if (currentDetailsUserId === uid) {
      closeModal("userDetailsModal");
      currentDetailsUserId = null;
    }

    showToast("Customer deleted", "success");
  } catch (error) {
    console.error("Delete user error:", error);
    showToast(error.message || "Failed to delete customer.", "danger");
  }
}


// App Initialization Check & Load
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "../login.html";
    return;
  }

  try {
    const adminDoc = await getDoc(doc(db, "users", user.uid));
    if (!adminDoc.exists() || adminDoc.data().isAdmin !== true) {
      alert("Access Denied ❌");
      window.location.href = "../home.html";
      return;
    }
  } catch (error) {
    console.error("Admin check error:", error);
    window.location.href = "../home.html";
    return;
  }

  loadUsers();
});
