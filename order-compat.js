/* ============================================================
   Bestify — v1 / v2 order compatibility helpers (read-only)

   Two order shapes exist in the `orders` collection:
     v1 (legacy)  — status "Pending", "Confirmed", "Packed",
                    "Shipped", "Out for Delivery", "Delivered",
                    "Cancelled"; line items in order.products.
     v2 (schemaVersion: 2, created by the placeOrder / verify
                    Cloud Functions) — early ones were written with
                    UPPERCASE statuses ("PLACED", "CONFIRMED"…).

   New v2 orders are now written with the legacy Title-case status
   and a legacy products array, so this file only matters for the
   few v2 orders created before that fix. Nothing here writes to
   Firestore — it only changes how an order is READ and shown.

   Import from the site root:  import { ... } from "./order-compat.js";
   Import from admin/ vendor/: import { ... } from "../order-compat.js";
   ============================================================ */

const STATUS_MAP = {
  PLACED: "Pending",
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PROCESSING: "Confirmed",
  PACKED: "Packed",
  SHIPPED: "Shipped",
  OUT_FOR_DELIVERY: "Out for Delivery",
  "OUT FOR DELIVERY": "Out for Delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  CANCELED: "Cancelled"
};

/**
 * Returns the Title-case status every existing page understands.
 * Legacy Title-case values, unknown values and empty/missing values
 * are returned exactly as they were, so legacy orders behave
 * identically to before.
 */
export function normalizeOrderStatus(status) {
  const raw = String(status ?? "").trim();
  if (!raw) return status;
  if (raw !== raw.toUpperCase()) return status; // already Title-case (legacy)
  return STATUS_MAP[raw] || status;
}

/** True for orders created by the server-side order engine. */
export function isV2Order(order) {
  return Number(order?.schemaVersion) === 2;
}

/** Always an array — never undefined — so pages can't crash on it. */
export function orderProducts(order) {
  return Array.isArray(order?.products) ? order.products : [];
}

/**
 * A copy of the order with status normalised for display/logic.
 * The original stored value is kept as `rawStatus`.
 */
export function normalizeOrder(order) {
  if (!order) return order;
  return {
    ...order,
    rawStatus: order.status,
    status: normalizeOrderStatus(order.status),
    products: orderProducts(order)
  };
}
