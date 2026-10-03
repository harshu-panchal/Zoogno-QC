/**
 * AppZeto JS Bridge Helper
 * This script should be included in your React application (MERN frontend).
 * It enables bidirectional communication between the React web app and the
 * Flutter native wrapper via the WebView JavaScript channel.
 */

// ---- Shared response dispatcher -------------------------------------------------
// Flutter answers by calling the single global window.onFlutterResponse(response).
// Install ONE dispatcher and fan out to listeners, instead of every call replacing
// (and later "restoring") the global - that chain broke when calls overlapped.
const responseListeners = new Set();
let legacyHandler = null;

function ensureDispatcher() {
  if (typeof window === 'undefined' || window.__appZetoDispatcherInstalled) return;
  window.__appZetoDispatcherInstalled = true;
  const previous = typeof window.onFlutterResponse === 'function' ? window.onFlutterResponse : null;
  window.onFlutterResponse = (response) => {
    let handled = false;
    for (const listener of Array.from(responseListeners)) {
      try {
        if (listener(response) === true) handled = true;
      } catch {
        /* a bad listener must not break the others */
      }
    }
    if (!handled) {
      if (legacyHandler) legacyHandler(response);
      else if (previous) previous(response);
    }
  };
}

function addResponseListener(listener) {
  ensureDispatcher();
  responseListeners.add(listener);
  return () => responseListeners.delete(listener);
}

const AppZetoBridge = {
  /**
   * Check if the app is running inside the Flutter WebView
   * @returns {boolean}
   */
  isFlutterApp: () => {
    return !!window.Flutter;
  },

  /**
   * Send a message to Flutter
   * @param {string} action - Action name (open_camera, get_location, pick_file, get_fcm_token)
   */
  send: (action) => {
    if (window.Flutter) {
      window.Flutter.postMessage(action);
    } else {
      console.warn("Flutter context not found. Are you running inside the Flutter app?");
    }
  },

  /**
   * Listen for responses from Flutter
   * @param {Function} callback - Function to handle the response
   */
  onResponse: (callback) => {
    ensureDispatcher();
    // response format: { type: "camera_response", data: "base64..." }
    legacyHandler = callback;
  },

  /**
   * Request FCM Token from Flutter and return it as a Promise.
   * Uses the shared response dispatcher, so concurrent callers (and other bridge
   * calls such as getLocation) never overwrite each other's listeners.
   * @returns {Promise<string|null>}
   */
  getFcmToken: (timeoutMs = 10000) => {
    return new Promise((resolve) => {
      if (!window.Flutter) {
        resolve(null);
        return;
      }
      let done = false;
      let timer = null;
      let off = () => {};
      const finish = (value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        off();
        resolve(value);
      };
      off = addResponseListener((response) => {
        if (response?.type !== 'fcm_token_response') return false;
        const d = response.data;
        const token = typeof d === 'string' ? d : d?.token || d?.fcmToken || '';
        finish(token ? String(token).trim() : null);
        return true;
      });
      timer = setTimeout(() => finish(null), timeoutMs);
      window.Flutter.postMessage('get_fcm_token');
    });
  },

  /**
   * Request Location from Flutter and return it as a Promise
   * @returns {Promise<{lat: number, lng: number}|null>}
   */
  getLocation: () => {
    return new Promise((resolve) => {
      if (!window.Flutter) {
        resolve(null);
        return;
      }
      let done = false;
      let timer = null;
      let off = () => {};
      const finish = (value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        off();
        resolve(value);
      };
      off = addResponseListener((response) => {
        if (response?.type !== 'location_response') return false;
        finish(response.data);
        return true;
      });
      timer = setTimeout(() => finish(null), 15000); // Higher timeout for GPS
      window.Flutter.postMessage('get_location');
    });
  },
};

// --- Example Usage in React Component ---

/*
import React, { useEffect, useState } from 'react';

const MyComponent = () => {
  const [image, setImage] = useState(null);

  useEffect(() => {
    AppZetoBridge.onResponse((res) => {
      if (res.type === 'camera_response' && res.data) {
        setImage(`data:image/jpeg;base64,${res.data}`);
      }
      if (res.type === 'location_response') {
        console.log("Current Location:", res.data);
      }
      if (res.type === 'fcm_token_response') {
        console.log("FCM Token:", res.data);
        // Send this token to your backend API to save it for push notifications
      }
    });
  }, []);

  const handleCapture = () => {
    AppZetoBridge.send("open_camera");
  };

  const handleGetLocation = () => {
    AppZetoBridge.send("get_location");
  };

  return (
    <div>
      <button onClick={handleCapture}>Open Camera</button>
      <button onClick={handleGetLocation}>Get Location</button>
      {image && <img loading="lazy" src={image} alt="Captured" style={{width: '200px'}} />}
    </div>
  );
};
*/

export default AppZetoBridge;
