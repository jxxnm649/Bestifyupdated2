import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAeBoKUy-EmQWueSoUMbJRNomYS36xif7o",
  authDomain: "bestifywebsite.firebaseapp.com",
  projectId: "bestifywebsite",
  storageBucket: "bestifywebsite.firebasestorage.app",
  messagingSenderId: "919181007023",
  appId: "1:919181007023:web:5edf231dd4bd2605fb1c5a"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
