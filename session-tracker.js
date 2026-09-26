import { db } from "./firebase.js";

import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const SESSION_ID_KEY = "bf_session_id";

function getDeviceLabel() {

  const ua = navigator.userAgent;

  let browser = "Browser";
  if (/Edg/.test(ua)) browser = "Edge";
  else if (/Chrome/.test(ua)) browser = "Chrome";
  else if (/Firefox/.test(ua)) browser = "Firefox";
  else if (/Safari/.test(ua)) browser = "Safari";

  let os = "Device";
  if (/Android/.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS/.test(ua)) os = "Mac";
  else if (/Linux/.test(ua)) os = "Linux";

  return `${browser} on ${os}`;

}

export function getSessionId() {

  let id = localStorage.getItem(SESSION_ID_KEY);
  let isNew = false;

  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    localStorage.setItem(SESSION_ID_KEY, id);
    isNew = true;
  }

  return { id, isNew };

}

/**
 * Records/updates a lightweight "this device is logged in" entry for
 * the Manage Device page. Best-effort: never blocks or breaks the
 * page if it fails.
 */
export async function touchSession(uid) {

  try {

    const { id: sessionId, isNew } = getSessionId();
    const sessionRef = doc(db, "users", uid, "sessions", sessionId);

    const payload = {
      deviceLabel: getDeviceLabel(),
      lastActiveAt: serverTimestamp()
    };

    if (isNew) {
      payload.createdAt = serverTimestamp();
    }

    await setDoc(sessionRef, payload, { merge: true });

  } catch (error) {
    console.error("touchSession failed:", error);
  }

}
