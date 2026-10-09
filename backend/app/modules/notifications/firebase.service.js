import admin from "firebase-admin";
import { getFirebaseAdminApp } from "../../config/firebaseAdmin.js";

const MAX_FCM_MULTICAST_TOKENS = 500;

/**
 * Must match the channel the Flutter wrapper creates (and the
 * `com.google.firebase.messaging.default_notification_channel_id` meta-data in its
 * AndroidManifest). If the channel does not exist on the device, Android 8+ falls back to
 * the manifest default - and if that is missing too, the notification is dropped silently.
 */
const ANDROID_CHANNEL_ID = () =>
  String(process.env.FCM_ANDROID_CHANNEL_ID || "order_updates").trim() || "order_updates";

function toStringMap(data = {}) {
  const out = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (value == null) continue;
    if (typeof value === "string") {
      out[key] = value;
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      out[key] = String(value);
      continue;
    }
    out[key] = JSON.stringify(value);
  }
  return out;
}

function chunkArray(input = [], size = MAX_FCM_MULTICAST_TOKENS) {
  const chunks = [];
  for (let i = 0; i < input.length; i += size) {
    chunks.push(input.slice(i, i + size));
  }
  return chunks;
}

function getMessagingClient() {
  const app = getFirebaseAdminApp();
  if (!app) {
    const err = new Error("Firebase Admin is not configured for push notifications");
    err.code = "fcm/not-configured";
    throw err;
  }
  return admin.messaging(app);
}

function isWebLink(value = "") {
  const link = String(value || "").trim();
  return /^https?:\/\//i.test(link);
}

function resolveLinkUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (isWebLink(raw)) return raw;
  if (raw.startsWith("/")) {
    const baseUrl = String(
      process.env.FRONTEND_URL || process.env.WEB_APP_URL || "http://localhost:5173",
    ).trim().replace(/\/+$/, "");
    return `${baseUrl}${raw}`;
  }
  return raw;
}

function resolveImageUrl(payload = {}, data = {}) {
  const fromData = String(
    data.imageUrl ||
      data.image ||
      payload?.imageUrl ||
      payload?.image ||
      "",
  ).trim();
  if (!fromData) return "";
  return isWebLink(fromData) ? fromData : resolveLinkUrl(fromData);
}

export async function sendFCM(tokens = [], payload = {}) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return {
      successCount: 0,
      failureCount: 0,
      responses: [],
    };
  }

  const messaging = getMessagingClient();
  const data = toStringMap(payload.data || {});
  const rawLink = data.deepLink || data.link || payload?.data?.deepLink || payload?.data?.link || "";
  const resolvedLink = resolveLinkUrl(rawLink);
  const title = payload.title || "";
  const body = payload.body || payload.message || "";
  const tag = data.orderId || data.eventType || "quick-commerce";
  const image = resolveImageUrl(payload, data);
  const chunks = chunkArray(tokens, MAX_FCM_MULTICAST_TOKENS);

  const merged = {
    successCount: 0,
    failureCount: 0,
    responses: [],
  };

  // Flutter's background/terminated handlers only receive `data`, never the `notification`
  // block, so the title/body/link have to be mirrored there for the app to render or route
  // a message it handles itself.
  const dataPayload = {
    ...data,
    title,
    body,
    ...(resolvedLink ? { link: resolvedLink } : {}),
    ...(image ? { image } : {}),
    click_action: "FLUTTER_NOTIFICATION_CLICK",
  };

  for (const chunk of chunks) {
    const result = await messaging.sendEachForMulticast({
      tokens: chunk,
      notification: {
        title,
        body,
        ...(image ? { image } : {}),
      },
      data: dataPayload,
      android: {
        priority: "high",
        notification: {
          sound: "default",
          channelId: ANDROID_CHANNEL_ID(),
          // Required by firebase_messaging for onMessageOpenedApp / getInitialMessage
          // to fire when the user taps a notification that the OS displayed.
          clickAction: "FLUTTER_NOTIFICATION_CLICK",
          // Deliberately no `tag`: on Android a repeated tag REPLACES the previous
          // notification, which would silently collapse two distinct alerts that share an
          // eventType (e.g. two LOW_STOCK_ALERTs). A missed rider/seller alert costs more
          // than a duplicate. The web channel keeps its tag below, where it is wanted.
          ...(image ? { imageUrl: image } : {}),
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            contentAvailable: true,
            badge: 1,
          },
        },
        headers: {
          "apns-priority": "10",
          "apns-push-type": "alert",
        },
        ...(image ? { fcmOptions: { imageUrl: image } } : {}),
      },
      webpush: {
        headers: {
          Urgency: "high",
          TTL: String(60 * 60),
        },
        notification: {
          title,
          body,
          tag,
          requireInteraction: true,
          ...(image ? { image } : {}),
          data: { link: resolvedLink || "" },
        },
        fcmOptions: resolvedLink ? { link: resolvedLink } : undefined,
      },
    });

    merged.successCount += Number(result.successCount || 0);
    merged.failureCount += Number(result.failureCount || 0);
    merged.responses.push(...(result.responses || []));
  }

  return merged;
}

export default {
  sendFCM,
};
