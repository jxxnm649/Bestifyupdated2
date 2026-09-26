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

import { showToast } from "../design-system.js";
import { logAdminAction } from "./audit.js";


const reportRange = document.getElementById("reportRange");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const reportKpis = document.getElementById("reportKpis");
const statusBreakdown = document.getElementById("statusBreakdown");
const topProducts = document.getElementById("topProducts");
const newUsersStat = document.getElementById("newUsersStat");

let allOrders = [];
let allUsers = [];


/* =========================
   HELPERS
========================= */

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function toDate(value) {
  try {
    const d = value?.toDate ? value.toDate() : new Date(value);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function orderDate(order) {
  return toDate(order.createdAt);
}

function userCreatedDate(user) {
  return toDate(user.createdAt || user.created_at || user.createdOn || user.dateCreated);
}

function priceNumber(value) {
  const n = Number(String(value || "0").replace(/[₹,\s]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

function rangeStart() {
  const val = reportRange.value;
  if (val === "all") return null;
  const days = Number(val);
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}


/* =========================
   LOAD DATA
========================= */

async function loadData() {
  reportKpis.innerHTML = `<div class="bf-card" style="padding:20px;">Loading report data...</div>`;

  try {
    const [ordersSnap, usersSnap] = await Promise.all([
      getDocs(collection(db, "orders")),
      getDocs(collection(db, "users"))
    ]);

    allOrders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    render();

  } catch (error) {
    console.error("Reports load error:", error);
    reportKpis.innerHTML = `<div class="bf-card" style="padding:20px;">Unable to load report data.</div>`;
    showToast("Unable to load report data", "danger");
  }
}


/* =========================
   RENDER
========================= */

function ordersInRange() {
  const start = rangeStart();
  if (!start) return allOrders;

  return allOrders.filter(o => {
    const d = orderDate(o);
    return d && d >= start;
  });
}

function usersInRange() {
  const start = rangeStart();
  if (!start) return allUsers;

  return allUsers.filter(u => {
    const d = userCreatedDate(u);
    return d && d >= start;
  });
}

function render() {
  const orders = ordersInRange();

  const delivered = orders.filter(o => String(o.status || "").toLowerCase() === "delivered");
  const cancelled = orders.filter(o => String(o.status || "").toLowerCase() === "cancelled");

  let revenue = 0;
  const productTally = {};

  delivered.forEach(order => {
    const items = Array.isArray(order.products) ? order.products : [];
    items.forEach(item => {
      const price = priceNumber(item.price);
      const qty = Number(item.qty) || 1;
      revenue += price * qty;

      const name = item.productName || "Unnamed product";
      if (!productTally[name]) productTally[name] = { qty: 0, revenue: 0 };
      productTally[name].qty += qty;
      productTally[name].revenue += price * qty;
    });
  });

  const avgOrderValue = delivered.length ? revenue / delivered.length : 0;

  reportKpis.innerHTML = `
    <div class="bf-card" style="padding:16px 20px; min-width:150px;">
      <div style="font-size:12px; opacity:.7;">Orders</div>
      <div style="font-size:22px; font-weight:700;">${orders.length}</div>
    </div>
    <div class="bf-card" style="padding:16px 20px; min-width:150px;">
      <div style="font-size:12px; opacity:.7;">Delivered Revenue</div>
      <div style="font-size:22px; font-weight:700;">₹${revenue.toLocaleString("en-IN")}</div>
    </div>
    <div class="bf-card" style="padding:16px 20px; min-width:150px;">
      <div style="font-size:12px; opacity:.7;">Avg. Order Value</div>
      <div style="font-size:22px; font-weight:700;">₹${avgOrderValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
    </div>
    <div class="bf-card" style="padding:16px 20px; min-width:150px;">
      <div style="font-size:12px; opacity:.7;">Cancelled Orders</div>
      <div style="font-size:22px; font-weight:700;">${cancelled.length}</div>
    </div>
  `;

  // Status breakdown
  const statusCounts = {};
  orders.forEach(o => {
    const s = o.status || "Pending";
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });

  const maxCount = Math.max(1, ...Object.values(statusCounts));

  statusBreakdown.innerHTML = Object.entries(statusCounts).length
    ? Object.entries(statusCounts).map(([status, count]) => `
        <div>
          <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
            <span>${escapeHtml(status)}</span>
            <span>${count}</span>
          </div>
          <div style="background:var(--paper-dim,#F2ECE0); border-radius:8px; height:8px; overflow:hidden;">
            <div style="background:var(--marigold,#F2A93B); height:100%; width:${(count / maxCount) * 100}%;"></div>
          </div>
        </div>
      `).join("")
    : `<p style="opacity:.7; font-size:13px;">No orders in this range.</p>`;

  // Top products
  const topList = Object.entries(productTally)
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 8);

  topProducts.innerHTML = topList.length
    ? topList.map(([name, stats]) => `
        <div style="display:flex; justify-content:space-between; font-size:13px; padding:8px 0; border-bottom:1px solid var(--line,#E4DED2);">
          <span>${escapeHtml(name)}</span>
          <span>${stats.qty} sold · ₹${stats.revenue.toLocaleString("en-IN")}</span>
        </div>
      `).join("")
    : `<p style="opacity:.7; font-size:13px;">No delivered orders in this range yet.</p>`;

  // New users
  newUsersStat.textContent = usersInRange().length;
}


/* =========================
   EXPORT CSV
========================= */

exportCsvBtn.addEventListener("click", async () => {
  const orders = ordersInRange();

  if (!orders.length) {
    showToast("No orders to export in this range", "info");
    return;
  }

  const rows = [
    ["Order ID", "Date", "Status", "Customer", "Items", "Total (₹)"]
  ];

  orders.forEach(o => {
    const items = Array.isArray(o.products) ? o.products : [];
    const itemCount = items.reduce((sum, p) => sum + (Number(p.qty) || 1), 0);
    const total = items.reduce((sum, p) => sum + priceNumber(p.price) * (Number(p.qty) || 1), 0);
    const d = orderDate(o);

    rows.push([
      o.id,
      d ? d.toLocaleDateString("en-IN") : "",
      o.status || "Pending",
      o.customerName || o.name || "",
      String(itemCount),
      total.toFixed(2)
    ]);
  });

  const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `bestify-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  await logAdminAction("Exported orders CSV", "Reports", { range: reportRange.value, rows: orders.length });
});

reportRange.addEventListener("change", render);


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

  await loadData();

});
