// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";

// COLE SEU CONFIG DO FIREBASE AQUI
const firebaseConfig = {
  apiKey: "AIzaSyD2PuqjNbWafWgVmuOR_LGX8yd9ZPahAzo",
  authDomain: "bolaocopa2026.firebaseapp.com",
  projectId: "bolaocopa2026",
  storageBucket: "bolaocopa2026.firebasestorage.app",
  messagingSenderId: "945158538092",
  appId: "1:945158538092:web:55224e94e5788e73156949",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
