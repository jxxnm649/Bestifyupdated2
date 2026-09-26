import { auth, db } from "../firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import {
  openModal,
  closeModal,
  showToast
} from "../design-system.js";


const chatSearch = document.getElementById("chatSearch");
const chatCount = document.getElementById("chatCount");
const chatsList = document.getElementById("chatsList");
const startChatBtn = document.getElementById("startChatBtn");

const startChatModal = document.getElementById("startChatModal");
const startChatCloseBtn = document.getElementById("startChatCloseBtn");
const startChatForm = document.getElementById("startChatForm");
const startChatUserSelect = document.getElementById("startChatUserSelect");
const startChatSubmitBtn = document.getElementById("startChatSubmitBtn");

const chatThreadModal = document.getElementById("chatThreadModal");
const chatThreadCloseBtn = document.getElementById("chatThreadCloseBtn");
const chatThreadTitle = document.getElementById("chatThreadTitle");
const chatMessages = document.getElementById("chatMessages");
const chatReplyForm = document.getElementById("chatReplyForm");
const chatReplyInput = document.getElementById("chatReplyInput");
const chatReplySendBtn = document.getElementById("chatReplySendBtn");

let allUsers = [];
let allChats = [];
let currentChatUserId = null;
let unsubscribeMessages = null;


/* =========================
   HELPERS
========================= */

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function formatDate(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return "Not available";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
      " · " +
      d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "Not available";
  }
}


/* =========================
   LOAD DATA
========================= */

async function loadUsers() {

  const snapshot = await getDocs(collection(db, "users"));

  allUsers = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));

}

function refreshStartChatOptions() {

  const existingChatUserIds = new Set(allChats.map(c => c.id));

  const eligibleUsers = allUsers.filter(u => !existingChatUserIds.has(u.id));

  startChatUserSelect.innerHTML =
    `<option value="">Select a user...</option>` +
    eligibleUsers.map((u) => {
      const name = u.name || u.fullName || u.displayName || u.email || "Unnamed user";
      return `<option value="${escapeHtml(u.id)}">${escapeHtml(name)}</option>`;
    }).join("");

}

async function loadChats() {

  try {

    let snapshot;

    try {
      snapshot = await getDocs(
        query(collection(db, "chats"), orderBy("lastMessageAt", "desc"))
      );
    } catch {
      snapshot = await getDocs(collection(db, "chats"));
    }

    allChats = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    refreshStartChatOptions();
    renderChatsList();

  } catch (error) {

    console.error("Chats loading error:", error);

    chatsList.innerHTML = `
      <div class="bf-card" style="padding:20px;">
        ❌ Unable to load chats.
      </div>
    `;

  }

}


/* =========================
   START NEW CHAT
========================= */

if (startChatBtn) {
  startChatBtn.addEventListener("click", () => {
    startChatForm.reset();
    openModal("startChatModal");
  });
}

if (startChatCloseBtn) {
  startChatCloseBtn.addEventListener("click", () => {
    closeModal("startChatModal");
  });
}

startChatForm.addEventListener("submit", async (e) => {

  e.preventDefault();

  const userId = startChatUserSelect.value;
  const user = allUsers.find(u => u.id === userId);

  if (!user) {
    showToast("Select a valid user", "danger");
    return;
  }

  startChatSubmitBtn.disabled = true;
  startChatSubmitBtn.textContent = "Starting...";

  try {

    const customerName = user.name || user.fullName || user.displayName || user.email || "Customer";

    await setDoc(doc(db, "chats", userId), {
      userId,
      customerName,
      lastMessage: "",
      lastMessageAt: serverTimestamp(),
      status: "Open",
      createdAt: serverTimestamp()
    });

    showToast("Chat started", "success");
    closeModal("startChatModal");
    startChatForm.reset();

    await loadChats();
    openChatThread(userId, customerName);

  } catch (error) {

    console.error("Start chat error:", error);
    showToast(error.message || "Failed to start chat.", "danger");

  } finally {

    startChatSubmitBtn.disabled = false;
    startChatSubmitBtn.textContent = "Start Chat";

  }

});


/* =========================
   CHATS LIST
========================= */

function getFilteredChats() {

  const term = chatSearch.value.trim().toLowerCase();

  return allChats.filter((c) => {
    const name = (c.customerName || "").toLowerCase();
    return !term || name.includes(term);
  });

}

function renderChatsList() {

  const filtered = getFilteredChats();

  chatCount.textContent = `Total Conversations: ${allChats.length}`;

  if (!filtered.length) {
    chatsList.innerHTML = `
      <div class="bf-card" style="padding:20px;">
        No conversations yet.
      </div>
    `;
    return;
  }

  chatsList.innerHTML = filtered.map((c) => {

    return `
      <div
        class="bf-card open-chat-btn"
        data-id="${escapeHtml(c.id)}"
        data-name="${escapeHtml(c.customerName || "Customer")}"
        style="padding:16px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; cursor:pointer;">

        <div>
          <div style="font-weight:700;">
            ${escapeHtml(c.customerName || "Customer")}
          </div>

          <div style="font-size:13px; opacity:.7; margin-top:2px;">
            ${c.lastMessage ? escapeHtml(c.lastMessage) : "No messages yet"}
          </div>

          <div style="font-size:12px; opacity:.55; margin-top:2px;">
            ${c.lastMessageAt ? formatDate(c.lastMessageAt) : formatDate(c.createdAt)}
          </div>
        </div>

        <button type="button" class="bf-btn bf-btn-ghost bf-btn-sm">
          Open
        </button>

      </div>
    `;

  }).join("");

}

if (chatSearch) chatSearch.addEventListener("input", renderChatsList);

if (chatsList) {
  chatsList.addEventListener("click", (e) => {

    const card = e.target.closest(".open-chat-btn");
    if (!card) return;

    openChatThread(card.dataset.id, card.dataset.name);

  });
}


/* =========================
   CHAT THREAD MODAL
========================= */

async function openChatThread(userId, customerName) {

  currentChatUserId = userId;
  chatThreadTitle.textContent = customerName || "Conversation";
  chatMessages.innerHTML = `<div style="padding:16px; opacity:.6;">Loading messages...</div>`;

  openModal("chatThreadModal");

  listenForMessages(userId);

}

function listenForMessages(userId) {

  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }

  const q = query(collection(db, "chats", userId, "messages"), orderBy("createdAt", "asc"));

  unsubscribeMessages = onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    renderMessages(messages);
  }, (error) => {
    console.error("Messages listen error:", error);
    chatMessages.innerHTML = `<div style="padding:16px;">❌ Unable to load messages.</div>`;
  });

}

function renderMessages(messages) {

  if (!messages.length) {
    chatMessages.innerHTML = `
      <div style="padding:16px; opacity:.6;">
        No messages yet. Say hello 👋
      </div>
    `;
    return;
  }

  chatMessages.innerHTML = messages.map((m) => {

    const isAdmin = m.sender === "admin";

    return `
      <div style="display:flex; justify-content:${isAdmin ? "flex-end" : "flex-start"}; margin-bottom:10px;">
        <div style="
          max-width:75%;
          padding:10px 14px;
          border-radius:14px;
          background:${isAdmin ? "var(--accent, #C9A24B)" : "var(--surface-2, #F2ECDD)"};
          color:${isAdmin ? "#fff" : "inherit"};
        ">
          <div style="font-size:14px; white-space:pre-wrap;">${escapeHtml(m.text || "")}</div>
          ${m.imageUrl ? `<img src="${escapeHtml(m.imageUrl)}" alt="" style="max-width:220px;border-radius:10px;margin-top:6px;display:block;">` : ""}
          <div style="font-size:11px; opacity:.75; margin-top:4px; text-align:right;">
            ${formatDate(m.createdAt)}
          </div>
        </div>
      </div>
    `;

  }).join("");

  chatMessages.scrollTop = chatMessages.scrollHeight;

}

if (chatThreadCloseBtn) {
  chatThreadCloseBtn.addEventListener("click", () => {
    closeModal("chatThreadModal");
    currentChatUserId = null;
    if (unsubscribeMessages) {
      unsubscribeMessages();
      unsubscribeMessages = null;
    }
  });
}

if (chatReplyForm) {
  chatReplyForm.addEventListener("submit", async (e) => {

    e.preventDefault();

    const text = chatReplyInput.value.trim();
    if (!text || !currentChatUserId) return;

    chatReplySendBtn.disabled = true;

    try {

      await addDoc(collection(db, "chats", currentChatUserId, "messages"), {
        sender: "admin",
        text,
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(db, "chats", currentChatUserId), {
        lastMessage: text,
        lastMessageAt: serverTimestamp()
      });

      chatReplyInput.value = "";
      // onSnapshot listener (started in openChatThread) refreshes the thread automatically.

      const idx = allChats.findIndex(c => c.id === currentChatUserId);
      if (idx !== -1) {
        allChats[idx] = { ...allChats[idx], lastMessage: text };
        renderChatsList();
      }

    } catch (error) {

      console.error("Send message error:", error);
      showToast(error.message || "Failed to send message.", "danger");

    } finally {

      chatReplySendBtn.disabled = false;

    }

  });
}


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

  await loadUsers();
  loadChats();

});
