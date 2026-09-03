import { getFirebaseRealtimeDb, getFirebaseAdminApp } from "../config/firebaseAdmin.js";

export const withTimeout = (promise, ms = 5000) => {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error("Firebase operation timed out")), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
};

/**
 * RTDB paths — customer reads `deliveryLocations/{orderId}/{deliveryBoyId}`.
 */
export const trackingPaths = {
  deliveryLocation: (orderId, deliveryBoyId) =>
    `/deliveryLocations/${orderId}/${deliveryBoyId}`,
  orderRider: (orderId) => `/orders/${orderId}/rider`,
  orderTrail: (orderId) => `/orders/${orderId}/trail`,
  orderRoute: (orderId) => `/orders/${orderId}/route`,
  deliveryCurrent: (deliveryId) => `/deliveries/${deliveryId}/current`,
  fleetActive: (deliveryId) => `/fleet/active/${deliveryId}`,
};

export const writeDeliveryLocation = async (deliveryId, orderId, snapshot) => {
  try {
    const db = getFirebaseRealtimeDb();
    if (!db) {
      return { deliveryId, orderId, snapshot, skipped: true };
    }

    const timestamp = snapshot.lastUpdatedAt || new Date().toISOString();
    const cleanSnapshot = {
      lat: snapshot.lat,
      lng: snapshot.lng,
      lastUpdatedAt: timestamp,
      deliveryId: snapshot.deliveryId,
      orderId: snapshot.orderId ?? null,
      source: snapshot.source || "gps",
    };

    if (snapshot.accuracy !== undefined && snapshot.accuracy !== null) {
      cleanSnapshot.accuracy = snapshot.accuracy;
    }
    if (snapshot.heading !== undefined && snapshot.heading !== null) {
      cleanSnapshot.heading = snapshot.heading;
    }
    if (snapshot.speed !== undefined && snapshot.speed !== null) {
      cleanSnapshot.speed = snapshot.speed;
    }
    if (snapshot.eta_seconds !== undefined && snapshot.eta_seconds !== null) {
      cleanSnapshot.eta_seconds = snapshot.eta_seconds;
    }
    if (
      snapshot.distance_remaining !== undefined &&
      snapshot.distance_remaining !== null
    ) {
      cleanSnapshot.distance_remaining = snapshot.distance_remaining;
    }
    if (snapshot.route_version !== undefined && snapshot.route_version !== null) {
      cleanSnapshot.route_version = snapshot.route_version;
    }
    if (snapshot.status) {
      cleanSnapshot.status = snapshot.status;
    }
    if (snapshot.matched !== undefined) {
      cleanSnapshot.matched = snapshot.matched;
    }

    const updates = {};
    updates[trackingPaths.deliveryCurrent(deliveryId)] = cleanSnapshot;
    updates[trackingPaths.fleetActive(deliveryId)] = {
      lat: snapshot.lat,
      lng: snapshot.lng,
      orderId: snapshot.orderId || null,
      lastUpdatedAt: timestamp,
      source: cleanSnapshot.source,
    };

    if (orderId && deliveryId) {
      // Primary customer path must include ETA / distance / route_version so
      // Firebase-only clients stay in parity with Socket.IO payloads.
      updates[trackingPaths.deliveryLocation(orderId, deliveryId)] = {
        ...cleanSnapshot,
        timestamp,
      };
      updates[trackingPaths.orderRider(orderId)] = cleanSnapshot;
    }

    await db.ref().update(updates);
    return { deliveryId, orderId, snapshot: cleanSnapshot };
  } catch (err) {
    console.error("writeDeliveryLocation error:", err.message);
    return null;
  }
};

export const appendTrailPoint = async (orderId, point) => {
  try {
    const db = getFirebaseRealtimeDb();
    if (!db) {
      return { orderId, point, skipped: true };
    }
    await db.ref(trackingPaths.orderTrail(orderId)).push(point);
    return { orderId, point };
  } catch (err) {
    console.error("appendTrailPoint error:", err.message);
    return null;
  }
};

export const writeRoutePolyline = async (orderId, routeData) => {
  try {
    const db = getFirebaseRealtimeDb();
    if (!db) return { orderId, routeData, skipped: true };

    const routeCache = {
      polyline: routeData.polyline,
      phase: routeData.phase || null,
      origin: routeData.origin || null,
      destination: routeData.destination || null,
      mode: routeData.mode || "driving",
      distance: routeData.distance,
      duration: routeData.duration,
      bounds: routeData.bounds,
      route_version: routeData.route_version ?? null,
      cachedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };

    await withTimeout(db.ref(trackingPaths.orderRoute(orderId)).set(routeCache), 5000);
    return { orderId, routeCache };
  } catch (err) {
    console.warn("writeRoutePolyline skipped:", err.message);
    return null;
  }
};

export const getRoutePolyline = async (orderId) => {
  try {
    const db = getFirebaseRealtimeDb();
    if (!db) return null;

    const snapshot = await withTimeout(db.ref(trackingPaths.orderRoute(orderId)).once('value'), 5000);
    const routeData = snapshot.val();

    if (!routeData) return null;

    const expiresAt = new Date(routeData.expiresAt);
    if (expiresAt < new Date()) {
      withTimeout(db.ref(trackingPaths.orderRoute(orderId)).remove(), 1000).catch(() => {});
      return null;
    }

    return routeData;
  } catch (err) {
    console.warn("getRoutePolyline skipped:", err.message);
    return null;
  }
};

const debugTrackingLog = (...args) => {
  if (process.env.DEBUG_LOCATION_TRACKING === "true") {
    console.log(...args);
  }
};

export const getTrackingState = async (orderId) => {
  try {
    const db = getFirebaseRealtimeDb();
    if (!db) {
      debugTrackingLog(`[getTrackingState] No Realtime DB connection available for order ${orderId}`);
      return { location: null, route: null };
    }

    debugTrackingLog(`[getTrackingState] Fetching tracking state for order ${orderId}...`);

    const BOOTSTRAP_TIMEOUT_MS = 2500;

    // 1. Get Location (try deliveryLocations first, fallback to orders/rider)
    let bestLocation = null;
    debugTrackingLog(`[getTrackingState] Querying /deliveryLocations/${orderId}...`);
    let val = null;
    try {
      const locSnap = await withTimeout(
        db.ref(`/deliveryLocations/${orderId}`).once("value"),
        BOOTSTRAP_TIMEOUT_MS,
      );
      val = locSnap.val();
    } catch (err) {
      debugTrackingLog(
        `[getTrackingState] deliveryLocations timed out/failed for ${orderId}:`,
        err.message,
      );
    }
    debugTrackingLog(`[getTrackingState] Raw data from /deliveryLocations/${orderId}:`, val);

    if (val && typeof val === "object") {
      // Find the most recent valid location
      let bestTime = 0;
      for (const k of Object.keys(val)) {
        const raw = val[k];
        if (raw && Number.isFinite(Number(raw.lat)) && Number.isFinite(Number(raw.lng))) {
          const t = raw.lastUpdatedAt
            ? new Date(raw.lastUpdatedAt).getTime()
            : raw.timestamp
              ? new Date(raw.timestamp).getTime()
              : 0;
          if (!bestLocation || t >= bestTime) {
            bestLocation = {
              lat: Number(raw.lat),
              lng: Number(raw.lng),
              accuracy: Number.isFinite(Number(raw.accuracy)) ? Number(raw.accuracy) : null,
              heading: Number.isFinite(Number(raw.heading))
                ? Number(raw.heading)
                : Number.isFinite(Number(raw.bearing))
                  ? Number(raw.bearing)
                  : null,
              speed: Number.isFinite(Number(raw.speed)) ? Number(raw.speed) : null,
              eta_seconds: Number.isFinite(Number(raw.eta_seconds))
                ? Number(raw.eta_seconds)
                : null,
              distance_remaining: Number.isFinite(Number(raw.distance_remaining))
                ? Number(raw.distance_remaining)
                : null,
              route_version: Number.isFinite(Number(raw.route_version))
                ? Number(raw.route_version)
                : null,
              lastUpdatedAt: raw.lastUpdatedAt || raw.timestamp || new Date().toISOString(),
            };
            bestTime = t;
          }
        }
      }
    }

    if (!bestLocation) {
      debugTrackingLog(`[getTrackingState] Querying fallback /orders/${orderId}/rider...`);
      try {
        const riderSnap = await withTimeout(
          db.ref(`/orders/${orderId}/rider`).once("value"),
          BOOTSTRAP_TIMEOUT_MS,
        );
        const raw = riderSnap.val();
        debugTrackingLog(`[getTrackingState] Raw data from /orders/${orderId}/rider:`, raw);

        if (raw && Number.isFinite(Number(raw.lat)) && Number.isFinite(Number(raw.lng))) {
          bestLocation = {
            lat: Number(raw.lat),
            lng: Number(raw.lng),
            accuracy: Number.isFinite(Number(raw.accuracy)) ? Number(raw.accuracy) : null,
            heading: Number.isFinite(Number(raw.heading))
              ? Number(raw.heading)
              : Number.isFinite(Number(raw.bearing))
                ? Number(raw.bearing)
                : null,
            speed: Number.isFinite(Number(raw.speed)) ? Number(raw.speed) : null,
            eta_seconds: Number.isFinite(Number(raw.eta_seconds))
              ? Number(raw.eta_seconds)
              : null,
            distance_remaining: Number.isFinite(Number(raw.distance_remaining))
              ? Number(raw.distance_remaining)
              : null,
            route_version: Number.isFinite(Number(raw.route_version))
              ? Number(raw.route_version)
              : null,
            lastUpdatedAt: raw.lastUpdatedAt || new Date().toISOString(),
          };
        }
      } catch (err) {
        debugTrackingLog(
          `[getTrackingState] rider fallback timed out/failed for ${orderId}:`,
          err.message,
        );
      }
    }

    debugTrackingLog(`[getTrackingState] Final resolved location for ${orderId}:`, bestLocation);

    // 2. Get Route (soft-fail on timeout)
    let routeData = null;
    try {
      routeData = await getRoutePolyline(orderId);
    } catch (err) {
      debugTrackingLog(
        `[getTrackingState] route fetch timed out/failed for ${orderId}:`,
        err.message,
      );
    }
    debugTrackingLog(`[getTrackingState] Fetched routeData for ${orderId}:`, routeData ? `Yes (polyline length: ${routeData.polyline?.length})` : "Null");

    return { location: bestLocation, route: routeData };
  } catch (err) {
    // Soft-fail bootstrap — do not spam as hard errors when Firebase is unreachable
    if (String(err.message || "").includes("timed out")) {
      debugTrackingLog(`[getTrackingState] Soft timeout for ${orderId}`);
    } else {
      console.warn(`[getTrackingState] Error for ${orderId}:`, err.message);
    }
    return { location: null, route: null };
  }
};

/**
 * Pushes an order chat message to Firebase RTDB under /chats/orders/{orderId}/messages.
 */
export const saveOrderChatMessage = async (orderId, message) => {
  try {
    const db = getFirebaseRealtimeDb();
    if (!db) return null;

    const messagesRef = db.ref(`/chats/orders/${orderId}/messages`);
    const messageId = message._id ? String(message._id) : messagesRef.push().key;
    const newMessageRef = messagesRef.child(messageId);

    const messageData = {
      _id: messageId,
      senderId: String(message.senderId),
      senderType: message.senderType,
      text: message.text || "",
      mediaUrl: message.mediaUrl || "",
      mediaType: message.mediaType || "",
      createdAt: message.createdAt || new Date().toISOString(),
    };

    await withTimeout(newMessageRef.set(messageData));
    return messageData;
  } catch (err) {
    console.error("saveOrderChatMessage error:", err.message);
    return null;
  }
};

/**
 * Retrieves all order chat messages from Firebase RTDB under /chats/orders/{orderId}/messages.
 */
export const getOrderChatMessages = async (orderId) => {
  try {
    const db = getFirebaseRealtimeDb();
    if (!db) return [];

    const snapshot = await withTimeout(db.ref(`/chats/orders/${orderId}/messages`).once("value"));
    const val = snapshot.val();
    if (!val) return [];

    const list = Object.keys(val).map((key) => ({
      ...val[key],
      _id: val[key]._id || key,
    }));
    // Sort chronologically
    list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    return list;
  } catch (err) {
    console.error("getOrderChatMessages error:", err.message);
    return [];
  }
};

/**
 * Pushes a ticket message to Firebase RTDB under /chats/tickets/{ticketId}/messages.
 */
export const saveTicketMessage = async (ticketId, message) => {
  try {
    const db = getFirebaseRealtimeDb();
    if (!db) return null;

    const messagesRef = db.ref(`/chats/tickets/${ticketId}/messages`);
    const newMessageRef = messagesRef.push();
    const messageId = newMessageRef.key;

    const messageData = {
      _id: messageId,
      sender: message.sender || "User",
      senderId: String(message.senderId),
      senderType: message.senderType,
      text: message.text || "",
      mediaUrl: message.mediaUrl || "",
      mediaType: message.mediaType || "",
      mimeType: message.mimeType || "",
      createdAt: message.createdAt || new Date().toISOString(),
      isAdmin: Boolean(message.isAdmin),
    };

    await withTimeout(newMessageRef.set(messageData));
    return messageData;
  } catch (err) {
    console.error("saveTicketMessage error:", err.message);
    return null;
  }
};

/**
 * Retrieves all ticket messages from Firebase RTDB under /chats/tickets/{ticketId}/messages.
 */
export const getTicketMessages = async (ticketId) => {
  try {
    const db = getFirebaseRealtimeDb();
    if (!db) return [];

    const snapshot = await withTimeout(db.ref(`/chats/tickets/${ticketId}/messages`).once("value"));
    const val = snapshot.val();
    if (!val) return [];

    const list = Object.keys(val).map((key) => ({
      ...val[key],
      _id: val[key]._id || key,
    }));
    // Sort chronologically
    list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    return list;
  } catch (err) {
    console.error("getTicketMessages error:", err.message);
    return [];
  }
};

/**
 * Sends a push notification to one or more FCM tokens using Firebase Admin SDK.
 * @param {string[]} tokens - Array of FCM device tokens.
 * @param {string} title - Notification title.
 * @param {string} body - Notification body text.
 * @param {object} [data] - Optional extra data payload.
 */
export const sendPushNotification = async (tokens, title, body, data = {}) => {
  try {
    const app = getFirebaseAdminApp();
    if (!app) {
      console.warn("Firebase App is not initialized. Skipping push notification.");
      return null;
    }
    
    if (!tokens || tokens.length === 0) {
      return null;
    }

    const message = {
      notification: { title, body },
      data: {
        ...data,
        click_action: "FLUTTER_NOTIFICATION_CLICK"
      },
      tokens: Array.isArray(tokens) ? tokens : [tokens]
    };

    const response = await app.messaging().sendEachForMulticast(message);
    console.log(`Successfully sent ${response.successCount} messages; Failed: ${response.failureCount}`);
    return response;
  } catch (err) {
    console.error("sendPushNotification error:", err.message);
    return null;
  }
};

