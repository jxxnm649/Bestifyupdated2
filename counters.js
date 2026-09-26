import { db } from "./firebase.js";

import {
  doc,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

/**
 * Atomically returns the next sequential number for a named counter
 * (e.g. "orders", "products"), creating the counter starting at 1 if
 * it doesn't exist yet.
 */
export async function nextSequenceNumber(counterName) {

  const counterRef = doc(db, "counters", counterName);

  const next = await runTransaction(db, async (tx) => {

    const snap = await tx.get(counterRef);
    const current = snap.exists() ? Number(snap.data().count || 0) : 0;
    const updated = current + 1;

    if (snap.exists()) {
      tx.update(counterRef, { count: updated });
    } else {
      tx.set(counterRef, { count: updated });
    }

    return updated;

  });

  return next;

}
