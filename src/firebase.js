import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDd_iQYgqqsxvNsLNMNEHg8u_-IVDoYHQc",
  authDomain: "photo-roulette-70b5e.firebaseapp.com",
  projectId: "photo-roulette-70b5e",
  storageBucket: "photo-roulette-70b5e.firebasestorage.app",
  messagingSenderId: "956420357508",
  appId: "1:956420357508:web:2a2066cc95652d2089b1d1"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);