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

// How long a successful server sync is trusted before it is re-asserted. The server
// deactivates tokens FCM reports as invalid, and FCM rotates native tokens, so a
// "registered once this session" flag would leave a device without a usable token forever.
const SYNC_TTL_MS = 6 * 60 * 60 * 1000;
const lastSyncAt = new Map();

export function hasRegisteredFcmToken(role = "customer") {
  const at = lastSyncAt.get(String(role || "customer").toLowerCase());
  return Boolean(at) && Date.now() - at < SYNC_TTL_MS;
}

export function getStoredFcmToken(role = "customer") {
  return localStorage.getItem(tokenKey(role)) || "";
}

export function clearStoredFcmToken(role = "customer") {
  localStorage.removeItem(tokenKey(role));
  sessionStorage.removeItem(registeredKey(role));
  lastSyncAt.delete(String(role || "customer").toLowerCase());
}

function persistStoredFcmToken(role = "customer", token = "") {
  if (!token) return;
  localStorage.setItem(tokenKey(role), token);
  lastSyncAt.set(String(role || "customer").toLowerCase(), Date.now());
}

/**
 * True inside a native wrapper. `window.Flutter` is the webview_flutter JS channel (customer app);
 * `window.flutter_inappwebview` is the flutter_inappwebview bridge (seller / delivery apps).
 * Only the *object's* presence is checked: the plugin can inject it before `callHandler` is usable.
 */
export function isNativeApp() {
  if (typeof window === "undefined") return false;
  return Boolean(window.Flutter || window.flutter_inappwebview);
}

/** Android WebView ("; wv)") / iOS WKWebView (no "Safari/" token) - a hint that a bridge is about to be injected. */
function looksLikeEmbeddedWebView() {
  if (typeof navigator === "undefined") return false;
  const ua = String(navigator.userAgent || "");
  if (/; wv\)/i.test(ua)) return true;
  return /iPhone|iPad|iPod/i.test(ua) && /AppleWebKit/i.test(ua) && !/Safari\//i.test(ua);
}

/**
 * The inappwebview bridge is injected asynchronously (documented `flutterInAppWebViewPlatformReady`
 * event), so a check made at React mount can run before it exists and wrongly fall into the
 * browser/service-worker path, which can never work inside a WebView. Resolve once it is there.
 */
export async function waitForNativeBridge(timeoutMs = 8000) {
  if (typeof window === "undefined") return false;
  if (isNativeApp()) return true;
  if (!looksLikeEmbeddedWebView()) return false;

  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    let poll = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(poll);
      window.removeEventListener("flutterInAppWebViewPlatformReady", onReady);
      resolve(isNativeApp());
    };
    const onReady = () => finish();
    window.addEventListener("flutterInAppWebViewPlatformReady", onReady);
    poll = setInterval(() => {
      if (isNativeApp()) finish();
    }, 250);
    timer = setTimeout(finish, timeoutMs);
  });
}

/** Real FCM tokens are ~140-170 chars of [A-Za-z0-9_-] with one ":". Rejects "null", errors, JSON, etc. */
export function isLikelyFcmToken(value = "") {
  const token = String(value || "").trim();
  return token.length >= 100 && token.length <= 4096 && token.includes(":") && !/\s/.test(token);
}

const NATIVE_TOKEN_HANDLERS = ["getFcmToken", "get_fcm_token", "getFCMToken", "fcmToken", "getToken", "get_token"];
/** Native code may push the token instead: `window.__NATIVE_FCM_TOKEN__ = "..."` and/or dispatch `appzeto:fcm-token`. */
const NATIVE_TOKEN_EVENT = "appzeto:fcm-token";
let nativeAttemptLog = [];

function noteNativeAttempt(entry) {
  nativeAttemptLog.push(String(entry).slice(0, 80));
  if (nativeAttemptLog.length > 20) nativeAttemptLog = nativeAttemptLog.slice(-20);
}

function extractToken(res) {
  if (!res) return "";
  if (typeof res === "string") return res.trim();
  return String(res.token || res.fcmToken || res.data || "").trim();
}

function waitForPushedNativeToken(timeoutMs) {
  return new Promise((resolve) => {
    const onToken = (event) => {
      const token = extractToken(event?.detail);
      if (isLikelyFcmToken(token)) done(token);
    };
    const done = (value) => {
      clearTimeout(timer);
      window.removeEventListener(NATIVE_TOKEN_EVENT, onToken);
      resolve(value);
    };
    const timer = setTimeout(() => done(""), timeoutMs);
    window.addEventListener(NATIVE_TOKEN_EVENT, onToken);
  });
}

/** Asks the native layer for the FCM token through whichever bridge the wrapper exposes. */
async function getNativeFcmToken() {
  nativeAttemptLog = [];
  const accept = (raw, source) => {
    const token = extractToken(raw);
    noteNativeAttempt(`${source}:${raw == null ? "null" : typeof raw}:${token ? token.length : 0}`);
    return isLikelyFcmToken(token) ? token : "";
  };

  // 1) Token already pushed by native code.
  const pushed = accept(window.__NATIVE_FCM_TOKEN__, "global");
  if (pushed) return pushed;

  // 2) flutter_inappwebview handlers (seller / delivery apps). An unregistered handler resolves to null.
  if (window.flutter_inappwebview?.callHandler) {
    for (const name of NATIVE_TOKEN_HANDLERS) {
      try {
        const token = accept(await window.flutter_inappwebview.callHandler(name), `inapp.${name}`);
        if (token) return token;
      } catch (err) {
        noteNativeAttempt(`inapp.${name}:throw:${err?.message || ""}`);
      }
    }
  }

  // 3) webview_flutter "Flutter" JS channel (customer app). Retry: native may not be ready at page load.
  if (window.Flutter) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const token = accept(await AppZetoBridge.getFcmToken(), "channel");
      if (token) return token;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  // 4) Last resort: give native code a short window to push the token to us.
  const late = accept(await waitForPushedNativeToken(5000), "event");
  if (late) return late;

  console.error("[push] Could not get a valid native FCM token:", nativeAttemptLog.join(" | "));
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
          hasInAppWebView: Boolean(window.flutter_inappwebview),
          hasCallHandler: Boolean(window.flutter_inappwebview?.callHandler),
          embeddedWebView: looksLikeEmbeddedWebView(),
          nativeAttempts: nativeAttemptLog.join(" | "),
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

  await waitForNativeBridge();
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

  await waitForNativeBridge();
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
  waitForNativeBridge,
  isLikelyFcmToken,
  describePushSupport,
  clearStoredFcmToken,
  ensureFcmTokenRegistered,
  getStoredFcmToken,
  hasRegisteredFcmToken,
  removeStoredFcmToken,
  scheduleFcmRegistrationOnUserGesture,
  startForegroundPushListener,
};
