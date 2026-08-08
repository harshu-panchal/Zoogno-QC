import { customerApi } from "../../modules/customer/services/customerApi";
import { onOrderLocationUpdate } from "./orderSocket";

const subscriptions = new Map();

const startPolling = (orderId) => {
  if (subscriptions.has(orderId)) {
    subscriptions.get(orderId).count++;
    return subscriptions.get(orderId);
  }

  const sub = {
    count: 1,
    locationHandlers: new Set(),
    routeHandlers: new Set(),
    trailHandlers: new Set(),
    lastLocation: null,
    lastRoute: null,
    interval: null
  };

  const fetchTracking = async () => {
    try {
      const res = await customerApi.getOrderTrackingState(orderId);
      if (res.data?.success) {
        const { location, route, trail } = res.data.data || {};
        
        // Notify location handlers if changed or fresh
        if (location) {
          sub.lastLocation = location;
          for (const handler of sub.locationHandlers) {
            handler(location);
          }
        }
        
        // Notify route handlers if route exists
        if (route) {
          sub.lastRoute = route;
          for (const handler of sub.routeHandlers) {
            handler(route);
          }
        }

        // Notify trail handlers if trail exists
        if (trail) {
          for (const handler of sub.trailHandlers) {
            handler(trail);
          }
        }
      }
    } catch (err) {
      console.warn("[tracking] Error fetching tracking state:", err);
    }
  };

  // Fetch immediately
  fetchTracking();
  // Poll every 5 seconds
  sub.interval = setInterval(fetchTracking, 5000);

  subscriptions.set(orderId, sub);
  return sub;
};

const stopPolling = (orderId, type, handler) => {
  const sub = subscriptions.get(orderId);
  if (!sub) return;

  if (type === 'location') sub.locationHandlers.delete(handler);
  if (type === 'route') sub.routeHandlers.delete(handler);
  if (type === 'trail') sub.trailHandlers.delete(handler);

  // If no handlers left at all, clear interval
  if (sub.locationHandlers.size === 0 && sub.routeHandlers.size === 0 && sub.trailHandlers.size === 0) {
    clearInterval(sub.interval);
    subscriptions.delete(orderId);
  }
};



export const subscribeToOrderLocation = (orderId, getToken, handler) => {
  if (!orderId || typeof handler !== "function") return () => {};
  
  const sub = startPolling(orderId);
  sub.locationHandlers.add(handler);
  if (sub.lastLocation) handler(sub.lastLocation); // Immediate callback if cached

  // Attach socket listener for real-time live location updates instead of polling
  const offSocket = onOrderLocationUpdate(getToken, (payload) => {
    if (payload && payload.location) {
      sub.lastLocation = payload.location;
      for (const h of sub.locationHandlers) {
        h(payload.location);
      }
    }
  });

  return () => {
    offSocket();
    stopPolling(orderId, 'location', handler);
  };
};

export const subscribeToOrderRoute = (orderId, handler) => {
  if (!orderId || typeof handler !== "function") return () => {};
  
  const sub = startPolling(orderId);
  sub.routeHandlers.add(handler);
  if (sub.lastRoute) handler(sub.lastRoute);

  return () => stopPolling(orderId, 'route', handler);
};

export const subscribeToOrderTrail = (orderId, handler) => {
  if (!orderId || typeof handler !== "function") return () => {};
  
  const sub = startPolling(orderId);
  sub.trailHandlers.add(handler);

  return () => stopPolling(orderId, 'trail', handler);
};

