import { getFirebaseRealtimeDb } from "../config/firebaseAdmin.js";

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
      updates[trackingPaths.deliveryLocation(orderId, deliveryId)] = {
        lat: snapshot.lat,
        lng: snapshot.lng,
        timestamp,
        lastUpdatedAt: timestamp,
        deliveryId,
        orderId,
        source: cleanSnapshot.source,
        ...(snapshot.accuracy !== undefined && snapshot.accuracy !== null
          ? { accuracy: snapshot.accuracy }
          : {}),
        ...(snapshot.heading !== undefined && snapshot.heading !== null
          ? { heading: snapshot.heading }
          : {}),
        ...(snapshot.speed !== undefined && snapshot.speed !== null
          ? { speed: snapshot.speed }
          : {}),
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
      cachedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };

    await db.ref(trackingPaths.orderRoute(orderId)).set(routeCache);
    return { orderId, routeCache };
  } catch (err) {
    console.error("writeRoutePolyline error:", err.message);
    return null;
  }
};

export const getRoutePolyline = async (orderId) => {
  try {
    const db = getFirebaseRealtimeDb();
    if (!db) return null;

    const snapshot = await db.ref(trackingPaths.orderRoute(orderId)).once('value');
    const routeData = snapshot.val();

    if (!routeData) return null;

    const expiresAt = new Date(routeData.expiresAt);
    if (expiresAt < new Date()) {
      await db.ref(trackingPaths.orderRoute(orderId)).remove();
      return null;
    }

    return routeData;
  } catch (err) {
    console.error("getRoutePolyline error:", err.message);
    return null;
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
    const newMessageRef = messagesRef.push();
    const messageId = newMessageRef.key;

    const messageData = {
      _id: messageId,
      senderId: String(message.senderId),
      senderType: message.senderType,
      text: message.text || "",
      mediaUrl: message.mediaUrl || "",
      mediaType: message.mediaType || "",
      createdAt: message.createdAt || new Date().toISOString(),
    };

    await newMessageRef.set(messageData);
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

    const snapshot = await db.ref(`/chats/orders/${orderId}/messages`).once("value");
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

    await newMessageRef.set(messageData);
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

    const snapshot = await db.ref(`/chats/tickets/${ticketId}/messages`).once("value");
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

