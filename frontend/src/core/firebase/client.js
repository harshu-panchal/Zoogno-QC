import { initializeApp, getApps } from "firebase/app";
import { getDatabase } from "firebase/database";

let firebaseApp = null;

export const getFirebaseApp = () => {
  if (firebaseApp) return firebaseApp;

  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

  if (!apiKey || !projectId) {
    console.warn(
      "[firebase] Missing VITE_FIREBASE_API_KEY or VITE_FIREBASE_PROJECT_ID; Firebase is disabled.",
    );
    return null;
  }

  const existing = getApps()[0];
  if (existing) {
    firebaseApp = existing;
    return firebaseApp;
  }

  const firebaseConfig = {
    apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || `https://${projectId}-default-rtdb.firebaseio.com`,
    projectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };

  firebaseApp = initializeApp(firebaseConfig);
  return firebaseApp;
};

export const getRealtimeDb = () => {
  const app = getFirebaseApp();
  if (!app) return null;
  const dbUrl = import.meta.env.VITE_FIREBASE_DATABASE_URL;
  // Pass explicit URL so we always hit the correct regional RTDB
  // even if the app was initialised by another module without databaseURL.
  return dbUrl ? getDatabase(app, dbUrl) : getDatabase(app);
};

