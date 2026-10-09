import { isSupported, getMessaging, getToken, onMessage } from "firebase/messaging";
import { getFirebaseApp } from "./client";
import axiosInstance from "@core/api/axios";
import nativeBridge, {
  acceptNativeToken,
  detectPlatformDetail,
  getCachedNativeToken,
  getNativeBridgeLog,
  hasNativeBridge,
  installNativePushBridge,
  isLikelyFcmToken,
  looksLikeEmbeddedWebView,
  onNativeToken,
  requestNativeFcmToken,
} from "./nativePushBridge";

let foregroundListenerStarted = false;
let foregroundUnsubscribe = null;
const REGISTERED_KEY_PREFIX = "push:registered:";
const TOKEN_KEY_PREFIX = "push:fcm-token:";
const GESTURE_EVENTS = ["pointerdown", "touchstart", "click", "keydown"];
const gestureHandlers = new Map();

function roleKey(role = "customer") {
  return String(role || "customer").toLowerCase();
}

function registeredKey(role = "customer") {
  return `${REGISTERED_KEY_PREFIX}${roleKey(role)}`;
}

function tokenKey(role = "customer") {
  return `${TOKEN_KEY_PREFIX}${roleKey(role)}`;
}

// How long a successful server sync is trusted before it is re-asserted. The server
// deactivates tokens FCM reports as invalid, and FCM rotates native tokens, so a
// "registered once this session" flag would leave a device without a usable token forever.
const SYNC_TTL_MS = 6 * 60 * 60 * 1000;
const lastSyncAt = new Map();

export function hasRegisteredFcmToken(role = "customer") {
  const at = lastSyncAt.get(roleKey(role));
  return Boolean(at) && Date.now() - at < SYNC_TTL_MS;
}

export function getStoredFcmToken(role = "customer") {
  try {
    return localStorage.getItem(tokenKey(role)) || "";
  } catch {
    return "";
  }
}

export function clearStoredFcmToken(role = "customer") {
  try {
    localStorage.removeItem(tokenKey(role));
    sessionStorage.removeItem(registeredKey(role));
  } catch {
    /* storage can throw in a locked-down WebView */
  }
  lastSyncAt.delete(roleKey(role));
}

function persistStoredFcmToken(role = "customer", token = "") {
  if (!token) return;
  try {
    localStorage.setItem(tokenKey(role), token);
  } catch {
    /* ignore */
  }
  lastSyncAt.set(roleKey(role), Date.now());
}

/**
 * True inside a native wrapper. Covers the webview_flutter JS channel (`window.Flutter`),
 * the flutter_inappwebview bridge, iOS WKWebView script handlers and Android
 * addJavascriptInterface bridges - see nativePushBridge.js.
 */
export function isNativeApp() {
  return hasNativeBridge();
}

export { isLikelyFcmToken };

/**
 * The inappwebview bridge is injected asynchronously (documented `flutterInAppWebViewPlatformReady`
 * event), so a check made at React mount can run before it exists and wrongly fall into the
 * browser/service-worker path, which can never work inside a WebView. Resolve once it is there.
 */
export async function waitForNativeBridge(timeoutMs = 8000) {
  if (typeof window === "undefined") return false;
  installNativePushBridge();
  if (isNativeApp()) return true;
  // A token already handed over proves we are inside a wrapper even if it injected no global.
  if (getCachedNativeToken()) return true;
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
      resolve(isNativeApp() || Boolean(getCachedNativeToken()));
    };
    const onReady = () => finish();
    window.addEventListener("flutterInAppWebViewPlatformReady", onReady);
    poll = setInterval(() => {
      if (isNativeApp() || getCachedNativeToken()) finish();
    }, 250);
    timer = setTimeout(finish, timeoutMs);
  });
}

/** Asks the native layer for the FCM token through whichever bridge the wrapper exposes. */
async function getNativeFcmToken() {
  const cached = getCachedNativeToken();
  if (cached) return cached;
  const token = await requestNativeFcmToken({ timeoutMs: 20000, retryEveryMs: 2500 });
  if (!token) {
    console.error("[push] Could not get a native FCM token:", getNativeBridgeLog());
  }
  return token;
}

export function describePushSupport() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { supported: false, reason: "no-window" };
  }

  // Native wrapper gets its token from the OS, so the browser-only checks below
  // (secure context, iOS Safari standalone) do not apply to it.
  if (isNativeApp() || getCachedNativeToken()) {
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

/** Single-flight per role. A global flag used to hand a delivery caller the customer's promise. */
const inFlightByRole = new Map();

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
          hasWebkitHandlers: Boolean(window.webkit?.messageHandlers),
          hasAndroidBridge: Boolean(window.Android || window.AndroidBridge || window.NativeBridge),
          embeddedWebView: looksLikeEmbeddedWebView(),
          platformDetail: detectPlatformDetail(),
          // Name must avoid /token/i or the server logger redacts the value.
          nativeCached: Boolean(getCachedNativeToken()),
          nativeAttempts: getNativeBridgeLog(),
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

/**
 * Keeps listening for a native token after a failed attempt, so a token that the Flutter
 * side produces late (OS permission dialog, Play-Services refresh, token rotation) still
 * gets registered instead of waiting for the next app launch.
 */
const lateWatchers = new Map();

function watchForLateNativeToken(role) {
  const key = roleKey(role);
  if (lateWatchers.has(key)) return;

  // The token we just failed on must not re-trigger registration: onNativeToken replays the
  // cached value to new subscribers, which would retry immediately and loop on a server-side
  // failure. Only a genuinely different token is worth another attempt.
  const alreadyTried = getCachedNativeToken();
  let stop = () => {};
  let fired = false;

  stop = onNativeToken((token) => {
    if (fired || !token || token === alreadyTried) return;
    fired = true;
    stop();
    lateWatchers.delete(key);
    ensureFcmTokenRegistered({ role: key, platform: "app" }).catch((error) => {
      console.warn("[push] Late native registration failed:", error?.message || error);
    });
  });

  lateWatchers.set(key, stop);
}

/** Single-flight per role: concurrent callers (AuthContext + layouts) share one registration. */
export function ensureFcmTokenRegistered(options = {}) {
  const key = roleKey(options.role);
  const existing = inFlightByRole.get(key);
  if (existing) return existing;

  const promise = registerFcmToken({ ...options, role: key })
    .catch((error) => {
      reportPushClientIssue(key, error);
      if (isNativeApp() || looksLikeEmbeddedWebView()) {
        watchForLateNativeToken(key);
      }
      throw error;
    })
    .finally(() => {
      inFlightByRole.delete(key);
    });

  inFlightByRole.set(key, promise);
  return promise;
}

async function registerFcmToken({
  role = "customer",
  platform = "web",
} = {}) {
  const native = await waitForNativeBridge();
  const support = describePushSupport();
  if (!support.supported) {
    throw new Error(support.message || `Push unsupported: ${support.reason}`);
  }

  if (!native) {
    const supported = await isSupported().catch(() => false);
    if (!supported) {
      throw new Error("Firebase Messaging is not supported in this environment");
    }
  }

  let token = "";

  if (native) {
    token = await getNativeFcmToken();
    if (!token) {
      throw new Error(
        `Failed to obtain native FCM token from the app (bridge: ${getNativeBridgeLog() || "no attempts"})`,
      );
    }
    // The backend stores web/app; everything native is "app", with the OS in platformDetail.
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

  // Body is intentionally just these two. The server derives the OS and device from the
  // request's own User-Agent, so there is nothing else for the client to send.
  await axiosInstance.post("/push/register", { token, platform });

  persistStoredFcmToken(role, token);
  return token;
}

export function scheduleFcmRegistrationOnUserGesture({
  role = "customer",
  platform = "web",
  onSuccess,
  onError,
} = {}) {
  if (typeof window === "undefined") return () => {};
  const key = roleKey(role);

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
      const token = await ensureFcmTokenRegistered({ role: key, platform });
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

  // Inside a wrapper the OS/Flutter layer owns display; the web SDK is not even supported.
  if (isNativeApp()) {
    return () => {};
  }

  const supported = await isSupported().catch(() => false);
  if (!supported) return () => {};

  const app = getFirebaseApp();
  if (!app) return () => {};

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

/** On-device diagnostics for the "Test FCM" buttons - says exactly which bridge replied. */
export function describePushEnvironment() {
  if (typeof window === "undefined") return { native: false };
  return {
    native: isNativeApp(),
    embeddedWebView: looksLikeEmbeddedWebView(),
    platformDetail: detectPlatformDetail(),
    hasFlutterChannel: Boolean(window.Flutter),
    hasInAppWebView: Boolean(window.flutter_inappwebview?.callHandler),
    hasWebkitHandlers: Boolean(window.webkit?.messageHandlers),
    hasAndroidBridge: Boolean(window.Android || window.AndroidBridge || window.NativeBridge),
    nativeCached: getCachedNativeToken() ? `${getCachedNativeToken().slice(0, 12)}...` : "",
    bridgeLog: getNativeBridgeLog(),
    support: describePushSupport(),
  };
}

export default {
  acceptNativeToken,
  describePushEnvironment,
  describePushSupport,
  clearStoredFcmToken,
  ensureFcmTokenRegistered,
  getStoredFcmToken,
  hasRegisteredFcmToken,
  isLikelyFcmToken,
  isNativeApp,
  nativeBridge,
  onNativeToken,
  removeStoredFcmToken,
  scheduleFcmRegistrationOnUserGesture,
  startForegroundPushListener,
  waitForNativeBridge,
};
