import { initializeApp } from "firebase/app";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";

// Your web app's Firebase configuration
// Replace these with actual config from Firebase console
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// NOTE: Do NOT enable `appVerificationDisabledForTesting` in builds that ship to
// real users. When true, the SDK renders a MOCK reCAPTCHA and sends a fake token;
// Firebase's production backend rejects that token as MALFORMED
// (auth/captcha-check-failed) and the SMS is never sent. It may only be used
// locally together with Firebase "test phone numbers".

export { auth, RecaptchaVerifier, signInWithPhoneNumber };
