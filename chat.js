import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { uploadToCloudinary as uploadToCloudinaryWithProgress, mountProgressBar } from "./upload-progress.js";

const chatMessages = document.getElementById("chatMessages");
const chatReplyForm = document.getElementById("chatReplyForm");
const chatInput = document.getElementById("chatInput");
const chatSendBtn = document.getElementById("chatSendBtn");

const mediaBtn = document.getElementById("mediaBtn");
const imageInput = document.getElementById("imageInput");
const photoPreviewRow = document.getElementById("photoPreviewRow");
const photoPreviewImg = document.getElementById("photoPreviewImg");
const photoPreviewName = document.getElementById("photoPreviewName");
const photoPreviewRemove = document.getElementById("photoPreviewRemove");

const imgViewer = document.getElementById("imgViewer");
const imgViewerImg = document.getElementById("imgViewerImg");
const imgViewerClose = document.getElementById("imgViewerClose");

let currentUser = null;
let unsubscribeMessages = null;
let selectedImageFile = null;

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function formatTime(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function renderMessages(messages) {

  if (!messages.length) {
    chatMessages.innerHTML = `<div class="chat-empty">👋 Say hello! Ask us anything about your order or products.</div>`;
    return;
  }

  chatMessages.innerHTML = messages.map((m) => {
    const isMine = m.sender !== "admin";
    return `
      <div class="chat-bubble-row ${isMine ? "mine" : "theirs"}">
        <div class="chat-bubble">
          <div class="chat-bubble-text"></div>
          ${m.imageUrl ? `<img class="chat-bubble-img" src="${m.imageUrl}" alt="Photo">` : ""}
          <div class="chat-bubble-time">${formatTime(m.createdAt)}</div>
        </div>
      </div>
    `;
  }).join("");

  // Set message text via textContent (not innerHTML) so nothing in the
  // stored text can ever be interpreted as markup or otherwise mangled.
  const textNodes = chatMessages.querySelectorAll(".chat-bubble-text");
  messages.forEach((m, i) => {
    if (textNodes[i]) textNodes[i].textContent = m.text || "";
  });

  chatMessages.querySelectorAll(".chat-bubble-img").forEach((img) => {
    img.addEventListener("click", () => {
      imgViewerImg.src = img.src;
      imgViewer.classList.add("show");
    });
  });

  requestAnimationFrame(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });

}

function listenForMessages(uid) {

  // Guard against a duplicate subscription if onAuthStateChanged ever
  // fires more than once in the same page load (token refresh, etc.) —
  // without this, old and new listeners would both be live at once.
  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }

  const q = query(collection(db, "chats", uid, "messages"), orderBy("createdAt", "asc"));

  unsubscribeMessages = onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMessages(messages);
  }, (error) => {
    console.error("Chat listen error:", error);
    chatMessages.innerHTML = `<div class="chat-empty">❌ Unable to load chat.</div>`;
  });

}

async function ensureChatDoc(user) {

  const chatRef = doc(db, "chats", user.uid);
  const chatSnap = await getDoc(chatRef);

  if (!chatSnap.exists()) {
    await setDoc(chatRef, {
      userId: user.uid,
      customerName: user.displayName || user.email || "Customer",
      lastMessage: "",
      lastMessageAt: serverTimestamp(),
      status: "Open",
      createdAt: serverTimestamp()
    });
  }

}

/* =========================
   PHOTO PICKER (real Cloudinary upload, same account already
   used for product photos elsewhere in the admin panel)
========================= */

function clearSelectedPhoto() {
  selectedImageFile = null;
  imageInput.value = "";
  photoPreviewRow.classList.remove("show");
}

mediaBtn.addEventListener("click", () => imageInput.click());

imageInput.addEventListener("change", () => {
  const file = imageInput.files && imageInput.files[0];
  if (!file) return;

  selectedImageFile = file;
  photoPreviewImg.src = URL.createObjectURL(file);
  photoPreviewName.textContent = file.name;
  photoPreviewRow.classList.add("show");
});

photoPreviewRemove.addEventListener("click", clearSelectedPhoto);

async function uploadChatImage(file, onProgress) {
  return uploadToCloudinaryWithProgress(file, onProgress);
}


/* =========================
   QUICK REPLY CHIPS — just fill the input, the person still
   presses Send (never auto-sent, never a fake canned reply).
========================= */

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    chatInput.value = chip.dataset.text || chip.textContent;
    chatInput.focus();
  });
});


/* =========================
   FULLSCREEN IMAGE VIEWER
========================= */

imgViewerClose.addEventListener("click", () => imgViewer.classList.remove("show"));
imgViewer.addEventListener("click", (e) => {
  if (e.target === imgViewer) imgViewer.classList.remove("show");
});


chatReplyForm.addEventListener("submit", async (e) => {

  e.preventDefault();

  if (chatSendBtn.disabled) return; // ignore double-tap while a send is in flight

  const text = chatInput.value.trim();
  const imageFile = selectedImageFile;

  if (!text && !imageFile) return;
  if (!currentUser) return;

  chatSendBtn.disabled = true;
  chatInput.value = "";
  clearSelectedPhoto();

  try {

    await ensureChatDoc(currentUser);

    let imageUrl = null;

    if (imageFile) {
      chatSendBtn.querySelector("span").textContent = "Uploading...";
      const bar = mountProgressBar(chatSendBtn.parentElement);
      try {
        imageUrl = await uploadChatImage(imageFile, (pct) => {
          bar.update(pct);
          chatSendBtn.querySelector("span").textContent = `Uploading... ${pct}%`;
        });
        bar.done();
      } finally {
        bar.remove();
      }
    }

    await addDoc(collection(db, "chats", currentUser.uid, "messages"), {
      sender: "user",
      text,
      ...(imageUrl ? { imageUrl } : {}),
      createdAt: serverTimestamp()
    });

    await updateDoc(doc(db, "chats", currentUser.uid), {
      lastMessage: text || "📷 Photo",
      lastMessageAt: serverTimestamp(),
      status: "Open"
    });

  } catch (error) {
    console.error("Send message error:", error);
    alert(error.message || "Failed to send message.");
    chatInput.value = text; // restore so the user doesn't lose what they typed
  } finally {
    chatSendBtn.disabled = false;
    chatSendBtn.querySelector("span").textContent = "Send";
  }

});

onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  try {
    await ensureChatDoc(user);
    listenForMessages(user.uid);
  } catch (error) {
    console.error("Chat init error:", error);
    chatMessages.innerHTML = `<div class="chat-empty">❌ Unable to load chat.</div>`;
  }

});
