/* ============================================================
   Bestify — placeOrder (multi-vendor order engine)

   WHAT THIS DOES
   One secure entry point that creates every new order, for both
   COD and online-paid flows:

     validate user → validate items against the REAL product docs
     → check stock → reduce stock atomically → create Master Order
     → create one Sub-order per vendor → create Commission records
     → write order history

   WHY IT'S ON THE SERVER
   Prices, stock and commission are all read from Firestore here,
   never taken from the browser. A tampered client can't buy a
   ₹15,000 phone for ₹1, can't give itself 0% commission, and
   can't drive stock negative.

   IDEMPOTENCY
   Every call carries a clientRequestId (COD) or the Razorpay
   payment id (online). That id becomes the document id in
   /orderRequests. The whole thing runs inside ONE Firestore
   transaction which first checks that doc — so a double-tap,
   a refresh, a repeated payment callback or a Functions retry
   all land on the same already-created order instead of making
   a second one or reducing stock twice.

   TRANSACTION SAFETY
   Stock reads and writes happen inside the same transaction as
   the order creation. If two customers race for the last unit,
   Firestore aborts and retries one of them, and that retry sees
   stock 0 and fails cleanly. Stock can never go negative.
   ============================================================ */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const db = admin.firestore();

const DEFAULT_COMMISSION_RATE = 10; // % — used when a vendor has none set

function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Builds the next sequential order number inside the transaction so
 * two simultaneous orders can't take the same number.
 */
async function nextOrderNumber(tx) {
  const ref = db.doc("counters/orders");
  const snap = await tx.get(ref);
  const next = (snap.exists ? Number(snap.data().count) || 0 : 0) + 1;
  tx.set(ref, { count: next }, { merge: true });
  return `BEST-${new Date().getFullYear()}-${String(next).padStart(6, "0")}`;
}

/**
 * The shared engine. `payment` describes how this order was paid:
 *   { method: "cod" }  or
 *   { method: "online", paymentId, razorpayOrderId }
 */
async function createOrder({ uid, requestId, items, customer, payment, couponId }) {

  if (!requestId) {
    throw new HttpsError("invalid-argument", "Missing request id.");
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpsError("invalid-argument", "Your cart is empty.");
  }
  if (!customer || !customer.name || !customer.mobile) {
    throw new HttpsError("invalid-argument", "Missing delivery details.");
  }
  if (payment.method !== "cod" && customer.deliveryMethod !== "pickup" && !customer.address) {
    throw new HttpsError("invalid-argument", "Missing delivery address.");
  }

  const requestRef = db.doc(`orderRequests/${requestId}`);

  return db.runTransaction(async (tx) => {

    /* ---------- 1. Idempotency gate ---------- */

    const existing = await tx.get(requestRef);
    if (existing.exists) {
      // Already processed — hand back the same order, create nothing.
      const data = existing.data();
      return {
        orderId: data.orderId,
        orderNumber: data.orderNumber,
        total: Number(data.total) || 0,
        duplicate: true
      };
    }

    /* ---------- 2. Read the REAL product docs ---------- */

    // Merge duplicate lines of the same product so stock maths is right.
    const wanted = new Map(); // productId -> qty
    const lineMeta = new Map(); // productId -> {selectedSize, selectedColour}

    for (const item of items) {
      const id = String(item.id || "").trim();
      const qty = Math.max(1, parseInt(item.qty, 10) || 1);
      if (!id) throw new HttpsError("invalid-argument", "A cart item is missing its product.");
      wanted.set(id, (wanted.get(id) || 0) + qty);
      if (!lineMeta.has(id)) {
        lineMeta.set(id, {
          selectedSize: item.selectedSize || null,
          selectedColour: item.selectedColour || null
        });
      }
    }

    const productIds = [...wanted.keys()];
    const productRefs = productIds.map(id => db.doc(`products/${id}`));
    const productSnaps = await tx.getAll(...productRefs);

    /* ---------- 3. Validate + group by vendor ---------- */

    const byVendor = new Map(); // vendorId -> line items
    const stockWrites = []; // { ref, newStock }

    productSnaps.forEach((snap, i) => {

      const id = productIds[i];
      const qty = wanted.get(id);

      if (!snap.exists) {
        throw new HttpsError("failed-precondition", "A product in your cart is no longer available.");
      }

      const p = snap.data();

      if (p.status && p.status !== "Active") {
        throw new HttpsError("failed-precondition", `"${p.productName || "A product"}" is not available right now.`);
      }

      const stock = Number(p.stock);
      if (Number.isFinite(stock)) {
        if (stock < qty) {
          throw new HttpsError(
            "failed-precondition",
            `Only ${stock} left of "${p.productName || "a product"}".`
          );
        }
        stockWrites.push({ ref: productRefs[i], newStock: stock - qty });
      }

      // Price comes from the product doc, never from the client.
      const unitPrice = money(p.price);
      const meta = lineMeta.get(id) || {};
      const vendorId = p.vendorId || "BESTIFY"; // shop's own stock

      const line = {
        productId: id,
        productName: p.productName || "Product",
        productImage: p.image || "",
        vendorId,
        quantity: qty,
        unitPrice,
        mrp: money(p.mrp),
        subtotal: money(unitPrice * qty),
        selectedSize: meta.selectedSize,
        selectedColour: meta.selectedColour
      };

      if (!byVendor.has(vendorId)) byVendor.set(vendorId, []);
      byVendor.get(vendorId).push(line);

    });

    /* ---------- 4. Vendor docs (for commission rate + name) ---------- */

    const vendorIds = [...byVendor.keys()];
    const realVendorIds = vendorIds.filter(v => v !== "BESTIFY");

    const vendorSnaps = realVendorIds.length
      ? await tx.getAll(...realVendorIds.map(v => db.doc(`vendors/${v}`)))
      : [];

    const vendorInfo = new Map();
    vendorSnaps.forEach((snap, i) => {
      const v = snap.exists ? snap.data() : {};
      vendorInfo.set(realVendorIds[i], {
        name: v.shopName || v.ownerName || "Vendor",
        // Rate is whatever the admin set on the vendor. Snapshotted
        // below, so changing it later never rewrites old orders.
        rate: Number.isFinite(Number(v.commissionRate))
          ? Number(v.commissionRate)
          : DEFAULT_COMMISSION_RATE
      });
    });

    /* ---------- 4b. Reward coupon (optional) ---------- */

    // The client only sends the coupon's id. Everything else — who it
    // belongs to, whether it's still unused, whether its product is in
    // this order, and how much it's worth — is read here, inside the
    // same transaction, so a coupon can never be used twice.
    // Read BEFORE any transaction write (Firestore requirement).
    let couponRef = null;
    let coupon = null;

    if (couponId && typeof couponId === "string") {
      const ref = db.collection("coupons").doc(couponId);
      const snap = await tx.get(ref);
      if (snap.exists) {
        const c = snap.data();
        const isValid =
          c.userId === uid &&
          c.used !== true &&
          c.productId &&
          wanted.has(String(c.productId));
        if (isValid) {
          couponRef = ref;
          coupon = c;
        } else {
          logger.warn("Coupon ignored (not valid for this order)", { uid, couponId });
        }
      }
    }

    /* ---------- 5. Totals ---------- */

    const itemsTotal = money(
      [...byVendor.values()].flat().reduce((sum, l) => sum + l.subtotal, 0)
    );

    // Same rule the checkout page shows: fixed ₹ off, never more than
    // the order itself. Funded by Bestify — vendor sub-order totals and
    // commissions are NOT reduced by it.
    const couponDiscount = coupon
      ? money(Math.min(Math.max(0, Number(coupon.discountAmount) || 0), itemsTotal))
      : 0;
    const orderTotal = money(Math.max(0, itemsTotal - couponDiscount));

    const orderNumber = await nextOrderNumber(tx);
    const now = admin.firestore.Timestamp.now();
    const masterRef = db.collection("orders").doc();

    /* ---------- 6. Sub-orders + commissions ---------- */

    const subOrderIds = [];
    let suffix = 0;

    for (const [vendorId, lines] of byVendor.entries()) {

      const info = vendorInfo.get(vendorId) || { name: "Bestify Mobile", rate: 0 };
      const subTotal = money(lines.reduce((s, l) => s + l.subtotal, 0));
      const commissionRate = vendorId === "BESTIFY" ? 0 : info.rate;
      const commissionAmount = money(subTotal * (commissionRate / 100));
      const vendorPayable = money(subTotal - commissionAmount);

      const subRef = db.collection("subOrders").doc();
      subOrderIds.push(subRef.id);

      const subOrderNumber = `${orderNumber}-${String.fromCharCode(65 + suffix)}`;
      suffix++;

      tx.set(subRef, {
        subOrderNumber,
        masterOrderId: masterRef.id,
        masterOrderNumber: orderNumber,
        vendorId,
        vendorName: info.name,
        userId: uid,

        customerName: customer.name,
        mobile: customer.mobile,
        address: customer.address || "",
        pincode: customer.pincode || "",
        deliveryMethod: customer.deliveryMethod || "home",

        products: lines,

        itemsTotal: subTotal,
        discount: 0,
        shipping: 0,
        total: subTotal,

        commissionRate,
        commissionAmount,
        vendorPayable,
        settlementStatus: "unsettled",
        settlementId: null,

        status: "PLACED",
        statusHistory: [{
          status: "PLACED",
          at: now,
          by: "customer",
          actorId: uid
        }],

        paymentMethod: payment.method,
        paymentStatus: payment.method === "cod" ? "pending" : "paid",

        createdAt: now,
        updatedAt: now
      });

      // Commission ledger record — created by the server only, and kept
      // consistent with the snapshot stored on the sub-order above.
      if (vendorId !== "BESTIFY") {
        tx.set(db.collection("commissions").doc(), {
          orderId: masterRef.id,
          orderNumber,
          subOrderId: subRef.id,
          subOrderNumber,
          vendorId,
          vendorName: info.name,
          orderAmount: subTotal,
          commissionRate,
          commissionAmount,
          vendorPayable,
          status: "Pending",
          source: "auto",
          createdAt: now,
          updatedAt: now
        });
      }

    }

    /* ---------- 7. Master order ---------- */

    tx.set(masterRef, {
      orderNumber,
      userId: uid,
      customerName: customer.name,
      mobile: customer.mobile,
      address: customer.address || "",
      pincode: customer.pincode || "",
      deliveryMethod: customer.deliveryMethod || "home",

      vendorIds,
      subOrderIds,

      // Legacy (v1) line-item array, kept alongside the v2 sub-orders so
      // every existing customer/admin page that reads order.products
      // (My Orders, invoice, admin orders, reports…) keeps working.
      products: [...byVendor.values()].flat().map(l => ({
        id: l.productId,
        productName: l.productName,
        price: l.unitPrice,
        mrp: l.mrp,
        qty: l.quantity,
        image: l.productImage,
        // Legacy orders had no vendorId for the shop's own stock.
        vendorId: l.vendorId === "BESTIFY" ? null : l.vendorId,
        ...(l.selectedSize ? { selectedSize: l.selectedSize } : {}),
        ...(l.selectedColour ? { selectedColour: l.selectedColour } : {})
      })),

      itemsTotal,
      couponDiscount,
      ...(coupon ? { couponCode: coupon.code || couponId, couponProductId: coupon.productId } : {}),
      shippingTotal: 0,
      total: orderTotal,

      paymentMethod: payment.method,
      paymentStatus: payment.method === "cod" ? "pending" : "paid",
      ...(payment.paymentId ? { paymentId: payment.paymentId } : {}),
      ...(payment.razorpayOrderId ? { razorpayOrderId: payment.razorpayOrderId } : {}),

      // Master order uses the same Title-case statuses as legacy orders
      // (Pending → Confirmed → Packed → Shipped → Delivered / Cancelled),
      // which every customer & admin page understands. Vendor
      // sub-orders keep their own UPPERCASE flow (PLACED, CONFIRMED…).
      status: "Pending",
      statusHistory: [{
        status: "Pending",
        at: now,
        by: "customer",
        actorId: uid
      }],

      isMultiVendor: vendorIds.length > 1,
      schemaVersion: 2, // v2 = master/sub-order. Legacy orders have none.

      cashbackAmount: 0,
      cashbackStatus: "none",

      createdAt: now,
      updatedAt: now
    });

    /* ---------- 8. Stock ---------- */

    for (const w of stockWrites) {
      tx.update(w.ref, { stock: w.newStock });
    }

    /* ---------- 8b. Mark the coupon spent ---------- */

    if (couponRef) {
      tx.update(couponRef, {
        used: true,
        usedOrderId: masterRef.id,
        usedAt: now
      });
    }

    /* ---------- 9. Close the idempotency gate ---------- */

    tx.set(requestRef, {
      uid,
      orderId: masterRef.id,
      orderNumber,
      total: orderTotal,
      method: payment.method,
      createdAt: now
    });

    return { orderId: masterRef.id, orderNumber, total: orderTotal, duplicate: false };

  });

}


/* ============================================================
   COD — no payment to verify, so this creates the order directly.
   ============================================================ */

exports.placeOrder = onCall(async (request) => {

  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Please sign in to place an order.");
  }

  const { items, customer, clientRequestId, couponId } = request.data || {};

  const result = await createOrder({
    uid: request.auth.uid,
    requestId: `cod_${request.auth.uid}_${clientRequestId}`,
    items,
    customer,
    payment: { method: "cod" },
    couponId
  });

  logger.info("COD order placed", {
    uid: request.auth.uid,
    orderNumber: result.orderNumber,
    duplicate: result.duplicate
  });

  return result;

});


// Shared with verifyRazorpayPayment so the online flow creates orders
// through exactly the same validated path as COD.
exports._createOrder = createOrder;
