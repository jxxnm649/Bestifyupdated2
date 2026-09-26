/* ============================================================
   Shared order-status logic.

   Both the Orders page (admin/orders.js) and the orders panel on
   the admin home page (admin/home-orders.js) change order status,
   and both must run the exact same cashback credit/void rules.
   Keeping that in one file means a fix to the money logic can
   never apply to one screen and not the other.
   ============================================================ */

import { db } from "../firebase.js";

import {
  collection,
  doc,
  getDoc,
  updateDoc,
  addDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { logAdminAction } from "./audit.js";


// Credits an order's cashback to the customer's real wallet, exactly
// once. Guarded by cashbackStatus so re-toggling the order status
// (e.g. Delivered -> Shipped -> Delivered) never pays out twice.
export async function creditOrderCashbackIfPending(orderId) {

  const orderSnap = await getDoc(doc(db, "orders", orderId));
  if (!orderSnap.exists()) return;

  const order = orderSnap.data();
  if (!order.cashbackAmount || order.cashbackStatus !== "pending") return;

  const userRef = doc(db, "users", order.userId);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return;

  const currentBalance = Number(userSnap.data().walletBalance) || 0;
  const newBalance = currentBalance + Number(order.cashbackAmount);

  const currentPending = Number(userSnap.data().pendingCashbackBalance) || 0;
  // Never below 0 — guards against this order's amount already having
  // been adjusted out-of-band (e.g. a manual correction).
  const newPending = Math.max(0, currentPending - Number(order.cashbackAmount));

  await updateDoc(userRef, {
    walletBalance: newBalance,
    pendingCashbackBalance: newPending
  });

  await addDoc(collection(db, "walletTransactions"), {
    userId: order.userId,
    customerName: order.customerName || "",
    type: "credit",
    amount: order.cashbackAmount,
    reason: `Delivery cashback — Order #${order.orderNumber || orderId.slice(0, 8)}`,
    balanceAfter: newBalance,
    createdAt: new Date()
  });

  await updateDoc(doc(db, "orders", orderId), { cashbackStatus: "credited" });

  await logAdminAction("Credited delivery cashback", "Orders", {
    orderId,
    userId: order.userId,
    amount: order.cashbackAmount
  });

}


// Removes a cancelled order's amount from the customer's pending
// total — no wallet credit happens here, since the order was never
// delivered.
export async function voidOrderCashbackIfPending(orderId) {

  const orderSnap = await getDoc(doc(db, "orders", orderId));
  if (!orderSnap.exists()) return;

  const order = orderSnap.data();
  if (!order.cashbackAmount || order.cashbackStatus !== "pending") return;

  const userRef = doc(db, "users", order.userId);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return;

  const currentPending = Number(userSnap.data().pendingCashbackBalance) || 0;
  const newPending = Math.max(0, currentPending - Number(order.cashbackAmount));

  await updateDoc(userRef, { pendingCashbackBalance: newPending });
  await updateDoc(doc(db, "orders", orderId), { cashbackStatus: "voided" });

}


/**
 * Sets an order's status and runs the cashback side-effects that go
 * with it. Throws on a real failure so the caller can surface it.
 * Returns { cashbackWarning } when the status saved but the cashback
 * step failed — the caller should tell the admin to check manually.
 */
export async function setOrderStatus(orderId, newStatus) {

  await updateDoc(doc(db, "orders", orderId), { status: newStatus });

  await logAdminAction("Updated order status", "Orders", { orderId, newStatus });

  let cashbackWarning = null;

  try {
    if (newStatus === "Delivered") {
      await creditOrderCashbackIfPending(orderId);
    } else if (newStatus === "Cancelled") {
      await voidOrderCashbackIfPending(orderId);
    }
  } catch (error) {
    console.error("Cashback step failed:", error);
    cashbackWarning = "Order status updated, but the cashback step failed — check the customer's wallet manually.";
  }

  return { cashbackWarning };

}
