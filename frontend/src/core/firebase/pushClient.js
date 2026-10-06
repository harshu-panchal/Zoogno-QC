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
  // TEMP WORKAROUND: Removed `|| window.flutter_inappwebview?.callHandler` 
  // so the Delivery App (which returns a dummy FCM token) falls back to Web Push like it did before Oct 3.
  return Boolean(window.Flutter);
}

const NATIVE_TOKEN_HANDLERS = ["getFcmToken", "get_fcm_token", "getFCMToken", "fcmToken"];

/** Asks the native layer for the FCM token through whichever bridge the wrapper exposes. */
async function getNativeFcmToken() {
  console.log('[FCM-DEBUG] getNativeFcmToken called');
  console.log('[FCM-DEBUG] window.flutter_inappwebview:', !!window.flutter_inappwebview?.callHandler);
  console.log('[FCM-DEBUG] window.Flutter:', !!window.Flutter);

  const extract = (res) => {
    if (!res) return "";
    if (typeof res === "string") return res.trim();
    return String(res.token || res.fcmToken || res.data || "").trim();
  };

  if (window.flutter_inappwebview?.callHandler) {
    for (const name of NATIVE_TOKEN_HANDLERS) {
      try {
        console.log('[FCM-DEBUG] Trying flutter_inappwebview handler:', name);
        const raw = await window.flutter_inappwebview.callHandler(name);
        console.log('[FCM-DEBUG] flutter_inappwebview response for', name, ':', typeof raw, raw ? String(raw).slice(0, 50) : raw);
        const token = extract(raw);
        if (token) {
          console.log('[FCM-DEBUG] Got token via flutter_inappwebview:', token.slice(0, 30) + '...');
          return token;
        }
      } catch (err) {
        console.warn('[FCM-DEBUG] flutter_inappwebview handler failed:', name, err?.message);
      }
    }
  }
  if (window.Flutter) {
    // Retry: the native side may not be ready right at page load.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      console.log('[FCM-DEBUG] Trying AppZetoBridge.getFcmToken attempt', attempt + 1);
      const raw = await AppZetoBridge.getFcmToken();
      console.log('[FCM-DEBUG] AppZetoBridge response:', typeof raw, raw ? String(raw).slice(0, 50) : raw);
      const token = extract(raw);
      if (token) {
        console.log('[FCM-DEBUG] Got token via AppZetoBridge:', token.slice(0, 30) + '...');
        return token;
      }
      console.log('[FCM-DEBUG] No token, waiting 1.5s before retry...');
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  console.error('[FCM-DEBUG] FAILED: Could not get native FCM token after all attempts');
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

/** Best-effort diagnostics so a silent native-registration failure shows up in server logs. */
function reportPushClientIssue(role, error) {
  try {
    if (typeof window === "undefined") return;
    axiosInstance
      .post("/push/client-log", {
        role,
        message: String(error?.message || error || "unknown").slice(0, 300),
        env: {
          native: isNativeApp(),
          hasFlutterChannel: Boolean(window.Flutter),
          hasInAppWebView: Boolean(window.flutter_inappwebview?.callHandler),
          secure: Boolean(window.isSecureContext),
          hasNotificationApi: typeof Notification !== "undefined",
          hasServiceWorker: "serviceWorker" in navigator,
          ua: String(navigator.userAgent || "").slice(0, 200),
        },
      })
      .catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Single-flight: concurrent callers (AuthContext + layouts) share one registration. */
export function ensureFcmTokenRegistered(options = {}) {
  if (inFlightRegistration) return inFlightRegistration;
  inFlightRegistration = registerFcmToken(options)
    .catch((error) => {
      reportPushClientIssue(options.role, error);
      throw error;
    })
    .finally(() => {
    inFlightRegistration = null;
  });
  return inFlightRegistration;
}

async function registerFcmToken({
  role = "customer",
  platform = "web",
  device = "",
} = {}) {
  console.log('[FCM-DEBUG] registerFcmToken called with role:', role, 'platform:', platform);

  const support = describePushSupport();
  console.log('[FCM-DEBUG] Push support:', JSON.stringify(support));
  if (!support.supported) {
    throw new Error(support.message || `Push unsupported: ${support.reason}`);
  }

  const native = isNativeApp();
  console.log('[FCM-DEBUG] isNativeApp:', native);
  if (!native) {
    const supported = await isSupported().catch(() => false);
    if (!supported) {
      throw new Error("Firebase Messaging is not supported in this environment");
    }
  }

  let token = "";

  if (native) {
    // Get token from the native layer
    console.log('[FCM-DEBUG] Requesting native FCM token...');
    token = await getNativeFcmToken();
    console.log('[FCM-DEBUG] Native FCM token result:', token ? token.slice(0, 30) + '...' : 'EMPTY/NULL');
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

  console.log('[FCM-DEBUG] Registering token with backend... role:', role, 'platform:', platform);
  try {
    const response = await axiosInstance.post("/push/register", {
      token,
      platform,
      device: device || navigator.userAgent,
    });
    console.log('[FCM-DEBUG] Backend registration SUCCESS:', response?.data?.message || 'ok');
  } catch (apiError) {
    console.error('[FCM-DEBUG] Backend registration FAILED:', apiError?.response?.status, apiError?.response?.data || apiError?.message);
    throw apiError;
  }

  persistStoredFcmToken(role, token);
  console.log('[FCM-DEBUG] Token persisted locally for role:', role);
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
