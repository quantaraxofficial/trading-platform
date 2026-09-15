import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

// Your web app's Firebase configuration from TradePilot project
const firebaseConfig = {
  apiKey: "AIzaSyBhd1nIc0VDSXjo_uC6JCLvRvcFl9GtKdU",
  authDomain: "quantarax.firebaseapp.com",
  projectId: "quantarax",
  storageBucket: "quantarax.firebasestorage.app",
  messagingSenderId: "422063542128",
  appId: "1:422063542128:web:1085dafdd73f24ef8a89b5",
  measurementId: "G-9L2S2P5TEB"
};

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Initialize Analytics conditionally (only in browser and if supported)
const analytics = typeof window !== 'undefined' ? isSupported().then(yes => yes ? getAnalytics(app) : null) : null;

export { auth, db, googleProvider, analytics };
