import { isSupported, getMessaging, getToken, onMessage } from "firebase/messaging";
import { getFirebaseApp } from "./client";
import axiosInstance from "@core/api/axios";
import AppZetoBridge from "../../lib/appZetoBridge";

let foregroundListenerStarted = false;
let foregroundUnsubscribe = null;
const REGISTERED_KEY_PREFIX = "push:registered:";
const TOKEN_KEY_PREFIX = "push:fcm-token:";
const GESTURE_EVENTS = ["pointerdown", "touchstart", "click", "keydown"];
const gestureHandlers = new Map();

function registeredKey(role = "customer") {
  return `${REGISTERED_KEY_PREFIX}${String(role || "customer").toLowerCase()}`;
}

function tokenKey(role = "customer") {
  return `${TOKEN_KEY_PREFIX}${String(role || "customer").toLowerCase()}`;
}

export function hasRegisteredFcmToken(role = "customer") {
  return sessionStorage.getItem(registeredKey(role)) === "1";
}

export function getStoredFcmToken(role = "customer") {
  return localStorage.getItem(tokenKey(role)) || "";
}

export function clearStoredFcmToken(role = "customer") {
  localStorage.removeItem(tokenKey(role));
  sessionStorage.removeItem(registeredKey(role));
}

function persistStoredFcmToken(role = "customer", token = "") {
  if (!token) return;
  localStorage.setItem(tokenKey(role), token);
  sessionStorage.setItem(registeredKey(role), "1");
}

/** True inside the native Flutter wrapper (webview_flutter channel OR flutter_inappwebview). */
export function isNativeApp() {
  if (typeof window === "undefined") return false;
  return Boolean(window.Flutter || window.flutter_inappwebview?.callHandler);
}

const NATIVE_TOKEN_HANDLERS = ["getFcmToken", "get_fcm_token", "getFCMToken", "fcmToken"];

/** Asks the native layer for the FCM token through whichever bridge the wrapper exposes. */
async function getNativeFcmToken() {
  const extract = (res) => {
    if (!res) return "";
    if (typeof res === "string") return res.trim();
    return String(res.token || res.fcmToken || res.data || "").trim();
  };

  if (window.flutter_inappwebview?.callHandler) {
    for (const name of NATIVE_TOKEN_HANDLERS) {
      try {
        const token = extract(await window.flutter_inappwebview.callHandler(name));
        if (token) return token;
      } catch {
        /* try the next handler name */
      }
    }
  }
  if (window.Flutter) {
    // Retry: the native side may not be ready right at page load.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const token = extract(await AppZetoBridge.getFcmToken());
      if (token) return token;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return "";
}

export function describePushSupport() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { supported: false, reason: "no-window" };
  }

  // Native wrapper gets its token from the OS, so the browser-only checks below
  // (secure context, iOS Safari standalone) do not apply to it.
  if (isNativeApp()) {
    return { supported: true, reason: "flutter-native" };
  }

  if (!window.isSecureContext) {
    return { supported: false, reason: "insecure-context" };
  }

  const ua = String(navigator.userAgent || "");
  const isIOS = /iPad|iPhone|iPod/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  const isStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true;

  if (isIOS && isSafari && !isStandalone) {
    return {
      supported: false,
      reason: "ios-safari-not-standalone",
      message: "On iPhone/iPad Safari, push notifications work only after installing the app to Home Screen.",
    };
  }

  if (window.Flutter) {
    return { supported: true, reason: "flutter-native" };
  }

  return { supported: true, reason: "ok" };
}

async function ensureServiceWorkerRegistration() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers are not supported in this browser");
  }
  const swUrl = "/firebase-messaging-sw.js";

  // Detect broken SPA hosting rewrites where SW URL serves index.html.
  try {
    const swResponse = await fetch(swUrl, { cache: "no-store" });
    if (!swResponse.ok) {
      throw new Error(`Service worker script not reachable (${swResponse.status})`);
    }
    const contentType = String(swResponse.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("text/html")) {
      throw new Error(
        "Service worker URL returned HTML. Check production rewrites and exclude /firebase-messaging-sw.js from SPA fallback.",
      );
    }
  } catch (error) {
    throw new Error(error?.message || "Unable to validate service worker script");
  }

  // Must be at site root for FCM web push.
  const registration = await navigator.serviceWorker.register(swUrl, {
    updateViaCache: "none",
  });
  await registration.update();
  await navigator.serviceWorker.ready;
  return registration;
}

async function showSystemNotification({ title, body, data } = {}) {
  const safeTitle = String(title || "Notification");
  const safeBody = String(body || "");
  const link = data?.link || data?.deepLink || "/";
  const tag = data?.orderId || data?.eventType || "quick-commerce";
  const image = String(data?.image || data?.imageUrl || "").trim();

  // Prefer SW notifications so they land in the OS notification center consistently.
  try {
    const reg = await navigator.serviceWorker.ready;
    if (reg?.showNotification) {
      await reg.showNotification(safeTitle, {
        body: safeBody,
        tag,
        requireInteraction: true,
        renotify: true,
        ...(image ? { image } : {}),
        data: {
          link,
          orderId: data?.orderId || "",
          eventType: data?.eventType || "",
          image,
        },
      });
      return;
    }
  } catch {
    // fallback below
  }

  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    const notification = new Notification(safeTitle, {
      body: safeBody,
      tag,
      requireInteraction: true,
      renotify: true,
      ...(image ? { image } : {}),
      data: {
        link,
        orderId: data?.orderId || "",
        eventType: data?.eventType || "",
        image,
      },
    });

    notification.onclick = function () {
      if (link && link !== "/") {
        window.location.href = link;
      }
      notification.close();
    };
  }
}

let inFlightRegistration = null;

/** Single-flight: concurrent callers (AuthContext + layouts) share one registration. */
export function ensureFcmTokenRegistered(options = {}) {
  if (inFlightRegistration) return inFlightRegistration;
  inFlightRegistration = registerFcmToken(options).finally(() => {
    inFlightRegistration = null;
  });
  return inFlightRegistration;
}

async function registerFcmToken({
  role = "customer",
  platform = "web",
  device = "",
} = {}) {
  const support = describePushSupport();
  if (!support.supported) {
    throw new Error(support.message || `Push unsupported: ${support.reason}`);
  }

  const native = isNativeApp();
  if (!native) {
    const supported = await isSupported().catch(() => false);
    if (!supported) {
      throw new Error("Firebase Messaging is not supported in this environment");
    }
  }

  let token = "";

  if (native) {
    // Get token from the native layer
    token = await getNativeFcmToken();
    if (!token) {
      throw new Error("Failed to obtain native FCM token from the app");
    }
    // Set platform to 'app' to match backend validation (instead of android/ios)
    platform = "app";
  } else {
    const app = getFirebaseApp();
    if (!app) {
      throw new Error("Firebase is not configured (missing VITE_FIREBASE_* env)");
    }

    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      throw new Error("Missing VITE_FIREBASE_VAPID_KEY");
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error("Notification permission not granted");
    }

    const swRegistration = await ensureServiceWorkerRegistration();
    const messaging = getMessaging(app);
    token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: swRegistration });
    if (!token) {
      throw new Error("Failed to obtain FCM token");
    }
  }

  await axiosInstance.post("/push/register", {
    token,
    platform,
    device: device || navigator.userAgent,
  });

  persistStoredFcmToken(role, token);
  return token;
}

export function scheduleFcmRegistrationOnUserGesture({
  role = "customer",
  platform = "web",
  device = "",
  onSuccess,
  onError,
} = {}) {
  if (typeof window === "undefined") return () => {};
  const key = String(role || "customer").toLowerCase();

  // Avoid duplicate listener stacks for the same role.
  const existingCleanup = gestureHandlers.get(key);
  if (existingCleanup) {
    return existingCleanup;
  }

  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    for (const eventName of GESTURE_EVENTS) {
      window.removeEventListener(eventName, handler, true);
    }
    gestureHandlers.delete(key);
  };

  const handler = async () => {
    remove();
    try {
      const token = await ensureFcmTokenRegistered({ role: key, platform, device });
      if (typeof onSuccess === "function") onSuccess(token);
    } catch (error) {
      if (typeof onError === "function") onError(error);
    }
  };

  for (const eventName of GESTURE_EVENTS) {
    window.addEventListener(eventName, handler, { capture: true, once: true, passive: true });
  }

  gestureHandlers.set(key, remove);
  return remove;
}

export async function removeStoredFcmToken({
  role = "customer",
  token = "",
} = {}) {
  const candidateToken = String(token || getStoredFcmToken(role) || "").trim();
  if (!candidateToken) {
    clearStoredFcmToken(role);
    return false;
  }

  await axiosInstance.delete("/push/remove", {
    data: {
      token: candidateToken,
    },
  });

  clearStoredFcmToken(role);
  return true;
}

export async function startForegroundPushListener() {
  if (foregroundListenerStarted && foregroundUnsubscribe) {
    return foregroundUnsubscribe;
  }

  if (!isNativeApp()) {
    const supported = await isSupported().catch(() => false);
    if (!supported) return () => {};
  }

  const app = getFirebaseApp();
  if (!app && !isNativeApp()) return () => {};

  // If in Flutter, the native app handles foreground notifications, 
  // but we can still return a dummy unsubscribe.
  if (isNativeApp()) {
    return () => {};
  }

  // Ensure SW exists (helps with consistent notification center behavior).
  try {
    await ensureServiceWorkerRegistration();
  } catch {
    // ignore
  }

  const messaging = getMessaging(app);
  const unsubscribe = onMessage(messaging, async (payload) => {
    const title =
      payload?.notification?.title || payload?.data?.title || "Notification";
    const body =
      payload?.notification?.body || payload?.data?.body || "";
    await showSystemNotification({
      title,
      body,
      data: payload?.data || {},
    });
  });

  foregroundListenerStarted = true;
  foregroundUnsubscribe = unsubscribe;
  return unsubscribe;
}

export default {
  isNativeApp,
  describePushSupport,
  clearStoredFcmToken,
  ensureFcmTokenRegistered,
  getStoredFcmToken,
  hasRegisteredFcmToken,
  removeStoredFcmToken,
  scheduleFcmRegistrationOnUserGesture,
  startForegroundPushListener,
};
