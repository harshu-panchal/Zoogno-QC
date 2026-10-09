import mongoose from "mongoose";
import Notification from "./notification.model.js";
import PushToken from "./token.model.js";
import NotificationPreference from "./preference.model.js";
import handleResponse from "../../utils/helper.js";
import logger from "../../services/logger.js";
import getPagination from "../../utils/pagination.js";
import User from "../../models/customer.js";
import Seller from "../../models/seller.js";
import Delivery from "../../models/delivery.js";
import Admin from "../../models/admin.js";
import {
  normalizeNotificationRole,
  ROLE_TO_USER_MODEL,
  ROLE_TO_RECIPIENT_MODEL,
  NOTIFICATION_ROLES,
  roleFromRecipientModel,
} from "./notification.constants.js";
import { notify } from "./notification.service.js";
import { NOTIFICATION_EVENTS } from "./notification.constants.js";
import { deliverNotificationById } from "./notification.worker.js";

function resolveRole(req) {
  return normalizeNotificationRole(req?.user?.role);
}

const BROADCAST_AUDIENCES = Object.freeze({
  all: [
    NOTIFICATION_ROLES.CUSTOMER,
    NOTIFICATION_ROLES.SELLER,
    NOTIFICATION_ROLES.DELIVERY,
  ],
  customers: [NOTIFICATION_ROLES.CUSTOMER],
  sellers: [NOTIFICATION_ROLES.SELLER],
  delivery: [NOTIFICATION_ROLES.DELIVERY],
});

function resolveNotificationFilter(req) {
  const userId = req?.user?.id;
  return {
    $or: [{ userId }, { recipient: userId }],
  };
}

function queryFromFilter(filter = {}, options = {}) {
  const query = {
    $or: filter.$or || [],
  };
  if (options.unreadOnly) {
    query.isRead = false;
  }
  if (options.status) {
    query.status = options.status;
  }
  return query;
}

function normalizeNotification(doc = {}) {
  const role = doc.role || roleFromRecipientModel(doc.recipientModel) || "customer";
  return {
    id: doc._id,
    userId: doc.userId || doc.recipient,
    role,
    type: doc.type,
    title: doc.title,
    body: doc.body || doc.message || "",
    data: doc.data || {},
    status: doc.status || "sent",
    isRead: Boolean(doc.isRead),
    createdAt: doc.createdAt,
    sentAt: doc.sentAt || doc.createdAt || null,
  };
}

function resolveBearerToken(req) {
  const header = String(req.headers?.authorization || "");
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.split(" ")[1] || "";
}

function normalizeLoginUser(doc) {
  if (!doc) return null;

  // Try to match the "user" shape expected by the client (best-effort across roles).
  const walletAmount =
    Number(doc.walletAmount ?? doc.walletBalance ?? doc.wallet ?? 0) || 0;
  const status =
    typeof doc.isActive === "boolean"
      ? doc.isActive
        ? "Active"
        : "Inactive"
      : String(doc.status || "").trim() || "Active";

  return {
    id: String(doc._id || doc.id || ""),
    name: String(doc.name || ""),
    phone: String(doc.phone || ""),
    email: String(doc.email || ""),
    walletAmount,
    refCode: String(doc.refCode || doc.referralCode || ""),
    status,
  };
}

async function fetchLoginUser(userModelName, userId) {
  // Note: customer model file exports model("User"), but is used as "Customer" elsewhere.
  const MODEL_MAP = {
    User,
    Seller,
    Delivery,
    Admin,
  };

  const model = MODEL_MAP[userModelName];
  if (!model) return null;

  // Keep the projection small and safe.
  const baseProjection = "name phone email role";
  const projectionByModel = {
    User: `${baseProjection} walletBalance isActive`,
    Seller: `${baseProjection} isActive isVerified applicationStatus`,
    Delivery: `${baseProjection} isOnline isVerified`,
    Admin: `${baseProjection} isVerified`,
  };

  return model.findById(userId).select(projectionByModel[userModelName] || baseProjection).lean();
}

/**
 * Clients report their platform with whatever vocabulary their layer uses - a Flutter
 * wrapper naturally sends "android"/"ios", a PWA sends "web". The stored enum only has
 * web|app, so normalize instead of rejecting: a 400 here meant the device was never
 * registered at all.
 */
const PLATFORM_ALIASES = Object.freeze({
  app: "app",
  native: "app",
  mobile: "app",
  android: "app",
  ios: "app",
  iphone: "app",
  ipad: "app",
  flutter: "app",
  web: "web",
  browser: "web",
  desktop: "web",
  pwa: "web",
});

function normalizePlatform(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "web";
  return PLATFORM_ALIASES[raw] || null;
}

/**
 * Derived from the request's own User-Agent, never from the body: the register payload is
 * deliberately just { token, platform }, and the UA the WebView already sends identifies
 * the OS just as well.
 */
function normalizePlatformDetail(platform, userAgent = "") {
  const ua = String(userAgent || "");
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  return platform === "web" ? "web" : "unknown";
}

/**
 * Values a broken native bridge hands back when it has no token. Everything else that is
 * long enough and has no whitespace is accepted: FCM does not guarantee any particular
 * token shape, and the old `token.includes(":")` / `length >= 100` gate silently rejected
 * legitimate registration tokens, which is why no `platform: "app"` rows were ever written.
 */
const JUNK_TOKEN_VALUES = new Set([
  "null",
  "undefined",
  "nan",
  "false",
  "true",
  "none",
  "error",
  "unknown",
  "no_token",
  "no-token",
]);

function describeTokenRejection(token) {
  if (!token) return "Push token is required";
  if (JUNK_TOKEN_VALUES.has(token.toLowerCase())) {
    return "The app reported no FCM token (native bridge returned a placeholder value)";
  }
  if (/\s/.test(token)) return "Push token must not contain whitespace";
  if (/^[[{]/.test(token)) {
    return "Push token looks like a JSON payload - send the token string itself";
  }
  if (token.length < 64) return "Push token is too short to be an FCM registration token";
  if (token.length > 4096) return "Push token is too long to be an FCM registration token";
  if (!/^[A-Za-z0-9_:.~%+/=-]+$/.test(token)) {
    return "Push token contains characters an FCM registration token cannot have";
  }
  return "";
}

export const registerPushToken = async (req, res) => {
  try {
    const userId = req?.user?.id;
    const role = resolveRole(req);
    const token = String(req.body?.token || "").trim();
    const platform = normalizePlatform(req.body?.platform);
    // The body is only { token, platform }. Everything else worth recording is already
    // on the request.
    const device = String(req.headers?.["user-agent"] || "").trim().slice(0, 300);

    if (!userId || !role) {
      return handleResponse(res, 401, "Unauthorized");
    }
    if (!platform) {
      return handleResponse(
        res,
        400,
        `platform must be one of ${Object.keys(PLATFORM_ALIASES).join(", ")}`,
      );
    }

    const rejection = describeTokenRejection(token);
    if (rejection) {
      logger.warn("[push] rejected push token", {
        userId,
        role,
        platform,
        length: token.length,
        reason: rejection,
        device: device.slice(0, 120),
      });
      return handleResponse(res, 400, rejection);
    }

    const platformDetail = normalizePlatformDetail(platform, device);
    const userModel = ROLE_TO_USER_MODEL[role];
    const tokenDoc = await PushToken.findOneAndUpdate(
      { token },
      {
        $set: {
          userId,
          role,
          userModel,
          token,
          platform,
          platformDetail,
          ...(device ? { device } : {}),
          isActive: true,
          lastUsedAt: new Date(),
          invalidatedAt: null,
          invalidReason: "",
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    ).lean();

    logger.info("[push] token registered", {
      userId,
      role,
      platform,
      platformDetail,
      tokenId: String(tokenDoc?._id || ""),
    });

    const bearerToken = resolveBearerToken(req);
    // The profile lookup is a convenience for callers that treat this like a login
    // response. It must never fail the registration: the token is already stored, and
    // returning 404 here made the client treat a successful save as an error and retry.
    const userDoc = await fetchLoginUser(userModel, userId).catch(() => null);

    return res.status(200).json({
      success: true,
      message: "Push token registered successfully",
      data: {
        tokenId: String(tokenDoc?._id || ""),
        platform,
        platformDetail,
        role,
        token: bearerToken,
        user: userDoc ? normalizeLoginUser(userDoc) : null,
      },
    });
  } catch (error) {
    logger.error("[push] token registration failed", { message: error.message });
    return handleResponse(res, 500, error.message);
  }
};

/**
 * What the server actually has for the caller. Called from the in-app "Test FCM" buttons so
 * a device can prove whether its token reached the database, and with which platform.
 */
export const getPushDiagnostics = async (req, res) => {
  try {
    const userId = req?.user?.id;
    const role = resolveRole(req);
    if (!userId || !role) {
      return handleResponse(res, 401, "Unauthorized");
    }

    const tokens = await PushToken.find({ userId, role })
      .select("platform platformDetail isActive device lastUsedAt invalidReason invalidatedAt createdAt token")
      .sort({ lastUsedAt: -1 })
      .limit(20)
      .lean();

    const firebaseConfigured = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);

    return handleResponse(res, 200, "Push diagnostics fetched", {
      role,
      firebaseConfigured,
      pushEnabled: String(process.env.PUSH_NOTIFICATIONS_ENABLED || "true").toLowerCase() !== "false",
      androidChannelId: String(process.env.FCM_ANDROID_CHANNEL_ID || "order_updates"),
      counts: {
        total: tokens.length,
        active: tokens.filter((item) => item.isActive).length,
        app: tokens.filter((item) => item.platform === "app").length,
        web: tokens.filter((item) => item.platform === "web").length,
      },
      tokens: tokens.map((item) => ({
        platform: item.platform,
        platformDetail: item.platformDetail || "unknown",
        isActive: Boolean(item.isActive),
        // Enough to match against the device's own token without exposing a sendable value.
        tokenPreview: `${String(item.token || "").slice(0, 12)}...${String(item.token || "").slice(-6)}`,
        device: String(item.device || "").slice(0, 120),
        invalidReason: item.invalidReason || "",
        lastUsedAt: item.lastUsedAt || null,
        createdAt: item.createdAt || null,
      })),
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/** Client-side push registration failures (native/webview) — logged so they can be diagnosed. */
export const logPushClientIssue = async (req, res) => {
  try {
    const body = req.body || {};
    logger.warn("[push-client] registration failed", {
      userId: req?.user?.id,
      role: resolveRole(req),
      message: String(body.message || "").slice(0, 300),
      env: body.env && typeof body.env === "object" ? body.env : undefined,
    });
    return handleResponse(res, 200, "Logged");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const removePushToken = async (req, res) => {
  try {
    const userId = req?.user?.id;
    const role = resolveRole(req);
    const token = String(req.body?.token || "").trim();

    if (!userId || !role) {
      return handleResponse(res, 401, "Unauthorized");
    }

    const filter = token
      ? { userId, role, token }
      : { userId, role };
    const result = await PushToken.deleteMany(filter);

    return handleResponse(res, 200, "Push token removed successfully", {
      deletedTokens: Number(result.deletedCount || 0),
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getNotifications = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 20,
      maxLimit: 100,
    });
    const unreadOnly = String(req.query?.unreadOnly || "").toLowerCase() === "true";
    const status = String(req.query?.status || "").trim() || undefined;
    const baseFilter = resolveNotificationFilter(req);
    const query = queryFromFilter(baseFilter, { unreadOnly, status });

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(query),
      Notification.countDocuments({
        ...queryFromFilter(baseFilter, { status }),
        isRead: false,
      }),
    ]);

    const items = notifications.map(normalizeNotification);
    return handleResponse(res, 200, "Notifications fetched successfully", {
      items,
      notifications: items,
      unreadCount,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const markNotificationsRead = async (req, res) => {
  try {
    const userId = req?.user?.id;
    if (!userId) {
      return handleResponse(res, 401, "Unauthorized");
    }

    const notificationId = String(
      req.body?.notificationId || req.params?.id || "",
    ).trim();
    const notificationIds = Array.isArray(req.body?.notificationIds)
      ? req.body.notificationIds.map((id) => String(id).trim()).filter(Boolean)
      : [];
    const candidateIds = notificationIds.length ? notificationIds : [notificationId];
    const validIds = candidateIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    const markAll = String(req.body?.markAll || "").toLowerCase() === "true";

    const filter =
      markAll || (!notificationId && notificationIds.length === 0)
        ? { $or: [{ userId }, { recipient: userId }], isRead: false }
        : {
            _id: { $in: validIds },
            $or: [{ userId }, { recipient: userId }],
          };

    const result = await Notification.updateMany(filter, {
      $set: { isRead: true },
    });

    return handleResponse(res, 200, "Notifications marked as read", {
      modifiedCount: Number(result.modifiedCount || 0),
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getNotificationPreferences = async (req, res) => {
  try {
    const userId = req?.user?.id;
    const role = resolveRole(req);
    if (!userId || !role) {
      return handleResponse(res, 401, "Unauthorized");
    }

    const preference = await NotificationPreference.findOneAndUpdate(
      { userId, role },
      { $setOnInsert: { userId, role } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    return handleResponse(res, 200, "Notification preferences fetched", preference);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updateNotificationPreferences = async (req, res) => {
  try {
    const userId = req?.user?.id;
    const role = resolveRole(req);
    if (!userId || !role) {
      return handleResponse(res, 401, "Unauthorized");
    }

    const update = {};
    if (typeof req.body?.orderUpdates === "boolean") {
      update.orderUpdates = req.body.orderUpdates;
    }
    if (typeof req.body?.deliveryUpdates === "boolean") {
      update.deliveryUpdates = req.body.deliveryUpdates;
    }
    if (typeof req.body?.promotions === "boolean") {
      update.promotions = req.body.promotions;
    }

    const preference = await NotificationPreference.findOneAndUpdate(
      { userId, role },
      {
        $set: update,
        $setOnInsert: { userId, role },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    return handleResponse(res, 200, "Notification preferences updated", preference);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const testPushNotification = async (req, res) => {
  try {
    const userId = req?.user?.id;
    const role = resolveRole(req);
    if (!userId || !role) {
      return handleResponse(res, 401, "Unauthorized");
    }

    const orderId = `TEST-${Date.now()}`;
    let eventType = NOTIFICATION_EVENTS.ORDER_PLACED;
    let payload = {
      orderId,
      userId,
      customerId: userId,
      role,
      data: { source: "manual_test" },
    };

    if (role === NOTIFICATION_ROLES.SELLER) {
      eventType = NOTIFICATION_EVENTS.NEW_ORDER;
      payload.sellerId = userId;
    } else if (role === NOTIFICATION_ROLES.DELIVERY) {
      eventType = NOTIFICATION_EVENTS.DELIVERY_ASSIGNED;
      payload.deliveryId = userId;
    }

    const result = await notify(eventType, payload);

    return handleResponse(res, 200, "Test push notification triggered", {
      orderId,
      notificationId: result?.notificationIds?.[0] || null,
      enqueued: Number(result?.enqueued || 0),
      duplicates: Number(result?.duplicates || 0),
      skipped: Number(result?.skipped || 0),
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const testPushTokenAdmin = async (req, res) => {
  try {
    const role = resolveRole(req);
    const adminId = String(req?.user?.id || "").trim();
    if (!adminId || role !== NOTIFICATION_ROLES.ADMIN) {
      return handleResponse(res, 403, "Only admin can test raw FCM tokens");
    }

    const { token, title, body, data } = req.body;
    if (!token) {
      return handleResponse(res, 400, "FCM token is required");
    }

    const message = {
      token,
      notification: {
        title: title || "Test Notification",
        body: body || "This is a test notification from the Admin Panel",
      },
      data: data || { source: "admin_test" },
    };

    const admin = await import("firebase-admin");
    const response = await admin.default.messaging().send(message);

    return handleResponse(res, 200, "Push notification sent successfully", {
      messageId: response,
      token,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message, { errorInfo: error.errorInfo || error });
  }
};

export const getTestPushNotificationStatus = async (req, res) => {
  try {
    const userId = req?.user?.id;
    const role = resolveRole(req);
    const orderId = String(req.params?.orderId || "").trim();

    if (!userId || !role) {
      return handleResponse(res, 401, "Unauthorized");
    }
    if (!orderId) {
      return handleResponse(res, 400, "orderId is required");
    }

    const notification = await Notification.findOne({
      $or: [{ userId }, { recipient: userId }],
      role,
      type: NOTIFICATION_EVENTS.ORDER_PLACED,
      "data.orderId": orderId,
      "data.source": "manual_test",
    })
      .sort({ createdAt: -1, _id: -1 })
      .lean();

    if (!notification) {
      return handleResponse(res, 200, "Test push notification is still being prepared", {
        orderId,
        status: "queued",
        found: false,
      });
    }

    return handleResponse(res, 200, "Test push notification status fetched", {
      orderId,
      found: true,
      notificationId: notification._id,
      status: notification.status || "pending",
      failureReason: notification.failureReason || "",
      sentAt: notification.sentAt || null,
      createdAt: notification.createdAt || null,
      deliveryStats: notification.deliveryStats || {
        attempted: 0,
        sent: 0,
        failed: 0,
        invalidTokens: 0,
      },
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const broadcastNotification = async (req, res) => {
  try {
    const role = resolveRole(req);
    const adminId = String(req?.user?.id || "").trim();
    if (!adminId || role !== NOTIFICATION_ROLES.ADMIN) {
      return handleResponse(res, 403, "Only admin can broadcast notifications");
    }

    const audience = String(req.body?.audience || "").trim().toLowerCase();
    const title = String(req.body?.title || "").trim();
    const message = String(req.body?.message || "").trim();
    const deepLink = String(req.body?.deepLink || "").trim();
    const imageUrl = String(req.body?.imageUrl || "").trim();
    const targetRoles = BROADCAST_AUDIENCES[audience];

    if (!targetRoles) {
      return handleResponse(
        res,
        400,
        "audience must be one of all, customers, sellers, delivery",
      );
    }
    if (!title) {
      return handleResponse(res, 400, "title is required");
    }
    if (!message) {
      return handleResponse(res, 400, "message is required");
    }
    if (title.length > 50) {
      return handleResponse(res, 400, "title must be 50 characters or less");
    }
    if (message.length > 200) {
      return handleResponse(res, 400, "message must be 200 characters or less");
    }

    const tokenOwners = await PushToken.find({
      role: { $in: targetRoles },
      isActive: true,
    })
      .select("userId role")
      .lean();

    const uniqueRecipients = new Map();
    for (const item of tokenOwners) {
      const userId = String(item?.userId || "").trim();
      const recipientRole = String(item?.role || "").trim();
      if (!userId || !recipientRole) continue;
      const key = `${recipientRole}:${userId}`;
      if (!uniqueRecipients.has(key)) {
        uniqueRecipients.set(key, {
          userId,
          role: recipientRole,
        });
      }
    }

    const recipients = Array.from(uniqueRecipients.values());
    if (!recipients.length) {
      return handleResponse(res, 200, "No active push recipients found for selected audience", {
        audience,
        roles: targetRoles,
        targetedUsers: 0,
        notificationsCreated: 0,
        delivered: 0,
        failed: 0,
      });
    }

    const broadcastId = `BROADCAST-${Date.now()}-${adminId.slice(-6)}`;
    const docs = recipients.map((recipient) => {
      const recipientModel = ROLE_TO_RECIPIENT_MODEL[recipient.role] || "User";
      const timestamp = Date.now();
      const dedupeKey = `${broadcastId}:${recipient.role}:${recipient.userId}:${timestamp}`;
      return {
        userId: recipient.userId,
        role: recipient.role,
        recipient: recipient.userId,
        recipientModel,
        type: "system",
        title,
        body: message,
        message,
        isRead: false,
        status: "pending",
        channel: "push",
        provider: "fcm",
        dedupeKey,
        data: {
          audience,
          deepLink,
          imageUrl,
          broadcastId,
          source: "admin_broadcast",
          sentBy: adminId,
        },
      };
    });

    const created = await Notification.insertMany(docs, { ordered: false });
    const notificationIds = created.map((item) => item?._id).filter(Boolean);
    const deliveryResults = await Promise.allSettled(
      notificationIds.map((notificationId) => deliverNotificationById(notificationId)),
    );

    const delivered = deliveryResults.filter((result) => result.status === "fulfilled").length;
    const failed = deliveryResults.length - delivered;

    // Log failures for debugging
    if (failed > 0) {
      const failedReasons = deliveryResults
        .filter((r) => r.status === "rejected")
        .map((r) => r.reason?.message || "Unknown error");
      console.error(`[Broadcast] ${failed}/${deliveryResults.length} deliveries failed:`, failedReasons.slice(0, 5));
    }
    console.log(`[Broadcast] ${broadcastId}: ${delivered} delivered, ${failed} failed out of ${notificationIds.length} notifications`);

    return handleResponse(res, 200, "Broadcast notification sent", {
      broadcastId,
      audience,
      roles: targetRoles,
      targetedUsers: recipients.length,
      notificationsCreated: notificationIds.length,
      delivered,
      failed,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getBroadcastAudienceStats = async (req, res) => {
  try {
    const role = resolveRole(req);
    const adminId = String(req?.user?.id || "").trim();
    if (!adminId || role !== NOTIFICATION_ROLES.ADMIN) {
      return handleResponse(res, 403, "Only admin can access audience stats");
    }

    const [customers, sellers, delivery] = await Promise.all([
      User.countDocuments({
        role: { $in: ["user", "customer"] },
      }),
      Seller.countDocuments({}),
      Delivery.countDocuments({}),
    ]);

    const result = {
      all: Number(customers || 0) + Number(sellers || 0) + Number(delivery || 0),
      customers: Number(customers || 0),
      sellers: Number(sellers || 0),
      delivery: Number(delivery || 0),
    };

    return handleResponse(res, 200, "Audience stats fetched", result);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export default {
  registerPushToken,
  getPushDiagnostics,
  removePushToken,
  getNotifications,
  markNotificationsRead,
  getNotificationPreferences,
  updateNotificationPreferences,
  testPushNotification,
  getTestPushNotificationStatus,
  broadcastNotification,
  getBroadcastAudienceStats,
};
