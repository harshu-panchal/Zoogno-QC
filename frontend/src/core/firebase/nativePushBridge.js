/**
 * Native (Flutter WebView) FCM token bridge.
 *
 * This module is imported EAGERLY from main.jsx, before React mounts, because the
 * Flutter wrapper can hand the token over at any moment - including before the first
 * React render. Previously the only receiver was installed lazily, inside the push
 * registration call, so a token delivered early (the normal case: Flutter resolves
 * `FirebaseMessaging.instance.getToken()` during splash) was dropped on the floor and
 * `platform: "app"` rows were never written.
 *
 * It accepts the token through every convention a Flutter wrapper might use, so the web
 * side does not have to know which one the app was built with:
 *
 *   PUSH (native -> web), all work at any time, even before React mounts:
 *     window.__NATIVE_FCM_TOKEN__ = "<token>"      (plain assignment; trapped by a setter)
 *     window.setFcmToken("<token>")                 (and onFcmToken / receiveFcmToken /
 *                                                    setFCMToken / onFcmTokenReceived)
 *     window.AppZetoPush.setToken("<token>")
 *     window.onFlutterResponse({ type: "fcm_token_response", data: "<token>" })
 *     window.dispatchEvent(new CustomEvent("appzeto:fcm-token", { detail: "<token>" }))
 *     window.postMessage({ type: "fcm_token", token: "<token>" }, "*")
 *     localStorage.setItem("fcm_token", "<token>")
 *     <page>?fcm_token=<token>
 *
 *   PULL (web -> native), attempted by requestNativeFcmToken():
 *     window.flutter_inappwebview.callHandler("<name>")
 *     window.Flutter.postMessage("get_fcm_token")   (webview_flutter JS channel)
 *     window.webkit.messageHandlers.<name>.postMessage(...)   (iOS WKWebView)
 *     window.Android.getFcmToken() / window.AndroidBridge.getFcmToken()  (synchronous)
 *     window.ReactNativeWebView.postMessage(...)
 *
 * See docs/PUSH_NOTIFICATIONS_FLUTTER_BRIDGE.md for the Dart side.
 */

const TOKEN_EVENTS = [
  "appzeto:fcm-token",
  "appzeto:fcmtoken",
  "fcm-token",
  "fcmToken",
  "fcm_token",
  "flutter:fcm-token",
  "native:fcm-token",
  "push-token",
];

const TOKEN_GLOBALS = [
  "__NATIVE_FCM_TOKEN__",
  "__FCM_TOKEN__",
  "__fcmToken",
  "fcmToken",
  "FCM_TOKEN",
  "nativeFcmToken",
  "deviceToken",
];

const TOKEN_STORAGE_KEYS = [
  "fcm_token",
  "fcmToken",
  "FCM_TOKEN",
  "native_fcm_token",
  "__NATIVE_FCM_TOKEN__",
];

/** Handler/channel/message names a Flutter wrapper might register for "give me the token". */
const TOKEN_HANDLER_NAMES = [
  "getFcmToken",
  "get_fcm_token",
  "getFCMToken",
  "fcmToken",
  "fcm_token",
  "getToken",
  "get_token",
  "getDeviceToken",
  "getPushToken",
  "requestFcmToken",
];

/**
 * Real FCM registration tokens are long opaque strings. Historically they looked like
 * "<instanceId>:APA91b<...>", but that shape is not guaranteed by FCM and newer tokens
 * can omit the colon - the old `token.includes(":")` gate silently 400'd valid tokens.
 * Only reject what cannot possibly be a token: junk sentinels, JSON, anything with
 * whitespace, and anything implausibly short.
 */
const JUNK_VALUES = new Set([
  "",
  "null",
  "undefined",
  "nan",
  "false",
  "true",
  "0",
  "none",
  "error",
  "unknown",
  "no_token",
  "no-token",
]);

export function isLikelyFcmToken(value) {
  const token = typeof value === "string" ? value.trim() : "";
  if (!token || JUNK_VALUES.has(token.toLowerCase())) return false;
  if (token.length < 64 || token.length > 4096) return false;
  if (/\s/.test(token)) return false;
  if (/^[[{]/.test(token)) return false; // JSON blob, not a token
  return /^[A-Za-z0-9_:.~%+/=-]+$/.test(token);
}

/** Pulls a token out of whatever shape the native side handed us. */
export function extractToken(input) {
  if (!input) return "";
  if (typeof input === "string") return input.trim();
  if (typeof input !== "object") return "";
  const candidate =
    input.token ??
    input.fcmToken ??
    input.fcm_token ??
    input.deviceToken ??
    input.registrationToken ??
    input.value ??
    input.data;
  if (candidate && typeof candidate === "object") return extractToken(candidate);
  return typeof candidate === "string" ? candidate.trim() : "";
}

let cachedToken = "";
const subscribers = new Set();
/** Rolling log of every handover attempt, surfaced to the server for diagnosis. */
let attemptLog = [];

function note(entry) {
  attemptLog.push(String(entry).slice(0, 120));
  if (attemptLog.length > 40) attemptLog = attemptLog.slice(-40);
}

export function getNativeBridgeLog() {
  return attemptLog.join(" | ");
}

export function getCachedNativeToken() {
  return cachedToken;
}

/**
 * Single funnel for every handover path. Caching here (rather than in the caller) is what
 * makes an early token survive until the push client is ready to register it.
 */
export function acceptNativeToken(raw, source = "unknown") {
  const token = extractToken(raw);
  if (!isLikelyFcmToken(token)) {
    note(`${source}:reject:${token ? `len${token.length}` : typeof raw}`);
    return "";
  }
  const isNew = token !== cachedToken;
  cachedToken = token;
  note(`${source}:accept:len${token.length}${isNew ? ":new" : ":same"}`);
  if (isNew) {
    for (const cb of Array.from(subscribers)) {
      try {
        cb(token, source);
      } catch {
        /* a bad subscriber must not break the others */
      }
    }
  }
  return token;
}

/** Subscribe to tokens arriving from the native layer. Fires immediately if one is cached. */
export function onNativeToken(callback) {
  if (typeof callback !== "function") return () => {};
  subscribers.add(callback);
  if (cachedToken) {
    try {
      callback(cachedToken, "cache");
    } catch {
      /* ignore */
    }
  }
  return () => subscribers.delete(callback);
}

/* ------------------------------------------------------------------ detection ---------- */

export function hasNativeBridge() {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.Flutter ||
      window.flutter_inappwebview ||
      window.AppZeto ||
      window.AppZetoNative ||
      window.__APPZETO_NATIVE__ ||
      window.AndroidBridge ||
      window.NativeBridge ||
      window.ReactNativeWebView ||
      (window.Android && typeof window.Android === "object") ||
      hasWebkitHandler(),
  );
}

function hasWebkitHandler() {
  const handlers = window.webkit?.messageHandlers;
  if (!handlers) return false;
  // WKWebView always exposes `webkit` on iOS; only a registered script-message handler
  // tells us a wrapper is actually listening.
  return TOKEN_HANDLER_NAMES.some((name) => handlers[name]) || Boolean(handlers.appzeto || handlers.flutter);
}

/** Android WebView ("; wv)") / iOS WKWebView (no "Safari/" token) - a bridge may still be injecting. */
export function looksLikeEmbeddedWebView() {
  if (typeof navigator === "undefined") return false;
  const ua = String(navigator.userAgent || "");
  if (/; wv\)/i.test(ua)) return true;
  if (/appzeto|zoogno/i.test(ua)) return true;
  return /iPhone|iPad|iPod/i.test(ua) && /AppleWebKit/i.test(ua) && !/Safari\//i.test(ua);
}

/** "android" | "ios" | "web" - stored alongside the token so app installs are debuggable. */
export function detectPlatformDetail() {
  if (typeof navigator === "undefined") return "web";
  const ua = String(navigator.userAgent || "");
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  return "web";
}

/* ------------------------------------------------------------------ receivers ---------- */

let installed = false;

function installGlobalSetters() {
  // Trap plain assignment (`window.__NATIVE_FCM_TOKEN__ = token`) so the most common
  // Flutter one-liner works without the web side polling for it.
  for (const name of TOKEN_GLOBALS) {
    let current = "";
    try {
      current = window[name];
    } catch {
      current = "";
    }
    if (current) acceptNativeToken(current, `global.${name}`);

    try {
      const existing = Object.getOwnPropertyDescriptor(window, name);
      if (existing && existing.configurable === false) continue;
      let stored = typeof current === "string" ? current : "";
      Object.defineProperty(window, name, {
        configurable: true,
        enumerable: true,
        get() {
          return stored;
        },
        set(value) {
          stored = value;
          acceptNativeToken(value, `set.${name}`);
        },
      });
    } catch {
      /* non-configurable in some engines; the poller below still covers it */
    }
  }

  // Callback style: `window.setFcmToken(token)` from Dart.
  const callbackNames = [
    "setFcmToken",
    "setFCMToken",
    "onFcmToken",
    "onFCMToken",
    "receiveFcmToken",
    "onFcmTokenReceived",
    "updateFcmToken",
    "pushFcmToken",
  ];
  for (const name of callbackNames) {
    const previous = typeof window[name] === "function" ? window[name] : null;
    window[name] = (value) => {
      acceptNativeToken(value, `cb.${name}`);
      if (previous) {
        try {
          previous(value);
        } catch {
          /* ignore */
        }
      }
      return true;
    };
  }

  // Namespaced API, so a wrapper can feature-detect before calling.
  const api = window.AppZetoPush && typeof window.AppZetoPush === "object" ? window.AppZetoPush : {};
  api.setToken = (value) => acceptNativeToken(value, "AppZetoPush.setToken");
  api.setFcmToken = api.setToken;
  api.getToken = () => cachedToken;
  api.isReady = () => true;
  window.AppZetoPush = api;
}

function installResponseInterceptor() {
  // webview_flutter contract: Dart replies by calling window.onFlutterResponse(response).
  // Chain onto whatever is already there (appZetoBridge installs its own dispatcher) instead
  // of replacing it, so camera/location replies keep working.
  const previous = typeof window.onFlutterResponse === "function" ? window.onFlutterResponse : null;
  const handler = (response) => {
    const type = String(response?.type || "");
    if (/fcm|token/i.test(type)) {
      acceptNativeToken(response?.data ?? response, `flutterResponse.${type || "untyped"}`);
    }
    if (previous) {
      try {
        return previous(response);
      } catch {
        /* ignore */
      }
    }
    return undefined;
  };
  handler.__appZetoPushChained = true;
  window.onFlutterResponse = handler;
}

function installEventListeners() {
  for (const name of TOKEN_EVENTS) {
    window.addEventListener(name, (event) => {
      acceptNativeToken(event?.detail ?? event?.data, `event.${name}`);
    });
  }

  // Some wrappers use window.postMessage instead of a JS channel.
  window.addEventListener("message", (event) => {
    const data = event?.data;
    if (!data) return;
    if (typeof data === "string") {
      // Only consider strings that are plausibly a token or a JSON envelope naming one.
      if (isLikelyFcmToken(data)) acceptNativeToken(data, "postMessage.string");
      else if (/fcm|token/i.test(data) && /^[[{]/.test(data.trim())) {
        try {
          acceptNativeToken(JSON.parse(data), "postMessage.json");
        } catch {
          /* ignore */
        }
      }
      return;
    }
    if (typeof data === "object" && /fcm|token/i.test(String(data.type || data.event || ""))) {
      acceptNativeToken(data, "postMessage.object");
    }
  });
}

function scanPassiveSources() {
  for (const key of TOKEN_STORAGE_KEYS) {
    try {
      const value = window.localStorage?.getItem(key);
      if (value) acceptNativeToken(value, `localStorage.${key}`);
    } catch {
      /* storage can throw in a locked-down WebView */
    }
  }

  try {
    const params = new URLSearchParams(window.location.search || "");
    for (const key of ["fcm_token", "fcmToken", "push_token", "token"]) {
      const value = params.get(key);
      if (value && isLikelyFcmToken(value)) acceptNativeToken(value, `query.${key}`);
    }
  } catch {
    /* ignore */
  }
}

/** Installs every push-style receiver. Idempotent; safe to call from anywhere. */
export function installNativePushBridge() {
  if (typeof window === "undefined" || installed) return;
  installed = true;
  try {
    installGlobalSetters();
    installResponseInterceptor();
    installEventListeners();
    scanPassiveSources();
    note("bridge:installed");
  } catch (error) {
    note(`bridge:install-failed:${error?.message || error}`);
  }
}

/* ------------------------------------------------------------------ pull paths ---------- */

/**
 * Fires every "give me the token" request we know of. Replies land in acceptNativeToken().
 * The full sweep of name variants runs once; retries re-send only the canonical names so a
 * wrapper is not spammed with dozens of unknown messages every few seconds.
 */
function requestTokenFromNative(fullSweep = false) {
  const names = fullSweep ? TOKEN_HANDLER_NAMES : TOKEN_HANDLER_NAMES.slice(0, 3);

  const handlers = window.flutter_inappwebview;
  if (handlers?.callHandler) {
    for (const name of names) {
      try {
        Promise.resolve(handlers.callHandler(name))
          .then((value) => acceptNativeToken(value, `inapp.${name}`))
          .catch((err) => note(`inapp.${name}:throw:${err?.message || ""}`));
      } catch (err) {
        note(`inapp.${name}:sync-throw:${err?.message || ""}`);
      }
    }
  }

  if (window.Flutter?.postMessage) {
    // webview_flutter channels only accept a single string argument.
    const messages = fullSweep
      ? ["get_fcm_token", "getFcmToken", JSON.stringify({ action: "get_fcm_token" })]
      : ["get_fcm_token"];
    for (const message of messages) {
      try {
        window.Flutter.postMessage(message);
        note(`channel.sent:${message.slice(0, 24)}`);
      } catch (err) {
        note(`channel.throw:${err?.message || ""}`);
      }
    }
  }

  const webkitHandlers = window.webkit?.messageHandlers;
  if (webkitHandlers) {
    for (const name of [...names, "appzeto", "flutter"]) {
      const handler = webkitHandlers[name];
      if (!handler?.postMessage) continue;
      try {
        handler.postMessage(name === "appzeto" || name === "flutter" ? { action: "get_fcm_token" } : "get_fcm_token");
        note(`webkit.sent:${name}`);
      } catch (err) {
        note(`webkit.throw:${name}:${err?.message || ""}`);
      }
    }
  }

  // Android addJavascriptInterface bridges are synchronous.
  for (const bridgeName of ["Android", "AndroidBridge", "NativeBridge", "AppZeto", "AppZetoNative"]) {
    const bridge = window[bridgeName];
    if (!bridge || typeof bridge !== "object") continue;
    for (const name of names) {
      const fn = bridge[name];
      if (typeof fn !== "function") continue;
      try {
        const value = fn.call(bridge);
        Promise.resolve(value)
          .then((resolved) => acceptNativeToken(resolved, `${bridgeName}.${name}`))
          .catch(() => {});
      } catch (err) {
        note(`${bridgeName}.${name}:throw:${err?.message || ""}`);
      }
    }
  }

  if (window.ReactNativeWebView?.postMessage) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "get_fcm_token" }));
      note("rnwebview.sent");
    } catch (err) {
      note(`rnwebview.throw:${err?.message || ""}`);
    }
  }
}

/**
 * Asks the native layer for a token and waits for it to arrive through ANY receiver.
 * Re-asks on an interval because the Flutter side is often still resolving
 * `getToken()` (or waiting on the OS permission dialog) when the WebView first loads.
 */
export function requestNativeFcmToken({ timeoutMs = 20000, retryEveryMs = 2500 } = {}) {
  installNativePushBridge();
  if (cachedToken) return Promise.resolve(cachedToken);

  return new Promise((resolve) => {
    // These are declared before `finish` on purpose: onNativeToken can invoke its callback
    // synchronously (from the cache), and `finish` would then touch bindings that are still
    // in their temporal dead zone.
    let settled = false;
    let retryTimer = null;
    let pollTimer = null;
    let deadline = null;
    let unsubscribe = () => {};

    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearInterval(retryTimer);
      clearInterval(pollTimer);
      clearTimeout(deadline);
      unsubscribe();
      resolve(value || cachedToken || "");
    };

    unsubscribe = onNativeToken((token) => finish(token));
    if (settled) {
      unsubscribe();
      return; // a cached token resolved us synchronously
    }

    requestTokenFromNative(true);
    retryTimer = setInterval(() => requestTokenFromNative(false), retryEveryMs);
    // Covers engines where defineProperty on window failed (value set, no setter fired).
    pollTimer = setInterval(scanPassiveSources, retryEveryMs);
    deadline = setTimeout(() => finish(""), timeoutMs);
  });
}

// Install on import so a token delivered during app boot is never lost.
installNativePushBridge();

export default {
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
};
