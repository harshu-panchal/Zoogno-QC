# Push Notifications — Flutter WebView Bridge Contract

How the Flutter wrapper hands its FCM token to the Zoogno web app so the backend can store it
as `platform: "app"` and send push to the device.

## Why this is needed

`google-services.json` + `firebase_messaging` gets the **app** an FCM token. It does **not** tell
the backend about it. The backend only learns about a device when something calls
`POST /api/push/register` with a logged-in user's JWT.

Inside the wrapper, the JWT lives in the **WebView** (the React app), not in Dart. So the flow has
to be:

```
Flutter: FirebaseMessaging.instance.getToken()
   │
   │  (1) hand the token into the WebView          ← THIS DOC
   ▼
WebView: nativePushBridge.js catches it
   │
   │  (2) POST /push/register { token, platform:"app" }    ← the whole body
   ▼
MongoDB: pushtokens row with platform:"app"
```

If step (1) is missing, nothing is stored and no push can ever be delivered to the app, no matter
how correct the Firebase setup is.

### The register payload

`POST /api/push/register`, `Authorization: Bearer <jwt>`, body is exactly two fields:

```json
{ "token": "<fcm registration token>", "platform": "app" }
```

`platform` accepts `app` / `android` / `ios` / `mobile` / `native` / `flutter` (all stored as
`"app"`) and `web` / `browser` / `pwa` / `desktop` (stored as `"web"`). It defaults to `"web"` when
omitted. Anything else is a 400 listing the accepted values.

The OS (`platformDetail`) and `device` are **derived server-side from the request's User-Agent** —
do not send them. Any extra fields in the body are ignored.

## The simplest working implementation (recommended)

One line of injected JavaScript. Works with **any** WebView package.

### `webview_flutter`

```dart
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:webview_flutter/webview_flutter.dart';

late final WebViewController controller;
bool _pageReady = false;
String? _pendingToken;

/// Pushes the token into the page. Safe to call repeatedly.
Future<void> _sendFcmTokenToWeb(String token) async {
  if (!_pageReady) {
    _pendingToken = token;          // page not loaded yet - send it after onPageFinished
    return;
  }
  final safe = jsonEncode(token);   // never string-concatenate into JS
  await controller.runJavaScript(
    'window.AppZetoPush && window.AppZetoPush.setToken($safe);'
    'window.__NATIVE_FCM_TOKEN__ = $safe;',
  );
}

Future<void> _initPush() async {
  await FirebaseMessaging.instance.requestPermission();   // required on Android 13+ and iOS

  final token = await FirebaseMessaging.instance.getToken();
  if (token != null) await _sendFcmTokenToWeb(token);

  // FCM rotates tokens. Push every refresh or the device goes silent after a rotation.
  FirebaseMessaging.instance.onTokenRefresh.listen(_sendFcmTokenToWeb);
}
```

Wire it into the controller:

```dart
controller = WebViewController()
  ..setJavaScriptMode(JavaScriptMode.unrestricted)
  ..setNavigationDelegate(NavigationDelegate(
    onPageFinished: (_) async {
      _pageReady = true;
      if (_pendingToken != null) {
        await _sendFcmTokenToWeb(_pendingToken!);
        _pendingToken = null;
      }
    },
  ))
  // Existing AppZeto channel: also answer the pull request from the web side.
  ..addJavaScriptChannel('Flutter', onMessageReceived: (msg) async {
    if (msg.message == 'get_fcm_token' || msg.message == 'getFcmToken') {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) await _sendFcmTokenToWeb(token);
    }
    // ...existing open_camera / get_location handling...
  })
  ..loadRequest(Uri.parse('https://zoogno.com'));
```

### `flutter_inappwebview`

```dart
InAppWebView(
  initialUrlRequest: URLRequest(url: WebUri('https://zoogno.com')),
  onWebViewCreated: (controller) {
    // Answers the web side's pull request.
    controller.addJavaScriptHandler(
      handlerName: 'getFcmToken',
      callback: (args) async => await FirebaseMessaging.instance.getToken(),
    );
  },
  onLoadStop: (controller, url) async {
    final token = await FirebaseMessaging.instance.getToken();
    if (token == null) return;
    await controller.evaluateJavascript(
      source: 'window.AppZetoPush && window.AppZetoPush.setToken(${jsonEncode(token)});',
    );
  },
)
```

> **`onLoadStop` fires on every navigation.** The web app is an SPA, so it mostly fires once —
> re-sending the token is harmless (the backend upserts by token).

## Every handover the web side accepts

You only need **one** of these. They are all implemented in
[`frontend/src/core/firebase/nativePushBridge.js`](../frontend/src/core/firebase/nativePushBridge.js),
installed before React mounts, so a token sent during app boot is never lost.

**Push (Dart → WebView)** — preferred, works at any time:

| JavaScript to run from Dart | Notes |
|---|---|
| `window.AppZetoPush.setToken("<token>")` | Recommended. Feature-detect with `window.AppZetoPush` |
| `window.__NATIVE_FCM_TOKEN__ = "<token>"` | Plain assignment; trapped by a property setter |
| `window.setFcmToken("<token>")` | Also `onFcmToken`, `receiveFcmToken`, `setFCMToken`, `onFcmTokenReceived`, `updateFcmToken`, `pushFcmToken` |
| `window.onFlutterResponse({type:"fcm_token_response", data:"<token>"})` | The existing AppZeto reply convention |
| `window.dispatchEvent(new CustomEvent("appzeto:fcm-token",{detail:"<token>"}))` | Also `fcm-token`, `fcm_token`, `native:fcm-token`, `flutter:fcm-token`, `push-token` |
| `window.postMessage({type:"fcm_token", token:"<token>"}, "*")` | |
| `localStorage.setItem("fcm_token","<token>")` | Read at page load only |
| `https://zoogno.com/?fcm_token=<token>` | Last resort; read at page load only |

**Pull (WebView → Dart)** — the web side also asks, once on registration and then every 2.5s for
20s, so a slow `getToken()` still lands:

| Mechanism | Names tried |
|---|---|
| `flutter_inappwebview` JS handler | `getFcmToken`, `get_fcm_token`, `getFCMToken` (+ 7 more on the first sweep) |
| `webview_flutter` JS channel `Flutter` | message `get_fcm_token` |
| iOS `webkit.messageHandlers.<name>` | same names, plus `appzeto`, `flutter` |
| Android `addJavascriptInterface` | `window.Android.getFcmToken()` etc. (synchronous return works) |

## Android: the notification channel

The backend sends `android.notification.channelId` — default `order_updates`, overridable with the
`FCM_ANDROID_CHANNEL_ID` env var on the server.

Create that exact channel in the app, **and** declare a manifest default as a safety net.
Without either, Android 8+ can silently drop the notification.

`android/app/src/main/AndroidManifest.xml`, inside `<application>`:

```xml
<meta-data
    android:name="com.google.firebase.messaging.default_notification_channel_id"
    android:value="order_updates" />
```

In Dart, at startup:

```dart
const channel = AndroidNotificationChannel(
  'order_updates',              // must equal FCM_ANDROID_CHANNEL_ID
  'Order updates',
  importance: Importance.high,  // required for heads-up + sound
);
await FlutterLocalNotificationsPlugin()
    .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
    ?.createNotificationChannel(channel);
```

Also required:

- **Android 13+**: `POST_NOTIFICATIONS` runtime permission —
  `FirebaseMessaging.instance.requestPermission()` handles the prompt.
- **iOS**: APNs auth key (`.p8`) uploaded to Firebase Console → Project settings → Cloud Messaging,
  plus the Push Notifications capability and `UIBackgroundModes: remote-notification`.

## What the backend sends

From [`firebase.service.js`](../backend/app/modules/notifications/firebase.service.js):

- A top-level `notification` block → the OS displays it automatically when the app is
  backgrounded or terminated. No Dart code needed for it to appear.
- `android.notification.clickAction = "FLUTTER_NOTIFICATION_CLICK"` → required for
  `onMessageOpenedApp` / `getInitialMessage` to fire on tap.
- `data` mirrors `title`, `body`, `link`, `image` and `click_action`, because Flutter's background
  handler only receives `data`, never the `notification` block.
- `apns-priority: 10`, `apns-push-type: alert`, `contentAvailable: true`.

Foreground messages are **not** auto-displayed on Android — that is FCM behaviour, not a bug. Show
them yourself:

```dart
FirebaseMessaging.onMessage.listen((message) {
  final n = message.notification;
  if (n != null) showLocalNotification(n.title, n.body, channelId: 'order_updates');
});
```

## Verifying it works

1. **In the app**, open Delivery → Profile → *Test Full FCM Notification*. It shows which bridge
   replied, registers the token, then reports the server's token counts. The full environment
   report is in the WebView console (`chrome://inspect` on Android).
2. **On the server**, confirm the row exists:
   ```bash
   cd backend && node scripts/push-token-report.js --role delivery --platform app
   ```
   `0 active app token(s)` means the handover above is still missing.
3. **From the device**, `GET /api/push/diagnostics` with the user's JWT returns that user's
   stored tokens with `platform` / `platformDetail` and a masked token preview.
4. **Server logs** on a successful registration:
   `[push] token registered { role: 'delivery', platform: 'app', platformDetail: 'android' }`.
   A rejection logs `[push] rejected push token` with the reason.
5. If the WebView reaches the bridge but gets nothing back, the client posts its environment to
   `POST /push/client-log`, which the server logs as `[push-client] registration failed` including
   `nativeAttempts` — a trace of every handover path that was tried.

## Common causes of "app push doesn't work"

| Symptom | Cause |
|---|---|
| No `platform:"app"` row at all | Dart never hands the token to the WebView (step 1 above) |
| `[push] rejected push token` with `placeholder value` | `getToken()` returned null — permission not granted, or Google Play Services missing |
| Row exists, push never arrives, token goes `isActive:false` | Token belongs to a **different Firebase project** than the backend service account (`zoogno-96f97`). The app's `google-services.json` must come from that same project, and the seller/delivery package names each need their own app registered in it |
| Push arrives in background only | Expected — handle `FirebaseMessaging.onMessage` for foreground |
| Push silent on Android 8+ | Channel `order_updates` not created, and no manifest default channel |
