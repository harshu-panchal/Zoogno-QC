/**
 * Adaptive GPS publish — 1–3s moving, slower when stationary.
 */
export function createLocationPublisher(postFn, options = {}) {
  const minIntervalMs = options.minIntervalMs ?? 1500;
  const stationaryIntervalMs = options.stationaryIntervalMs ?? 8000;
  const minMoveM = options.minMoveM ?? 8;
  const stationarySpeedMs = options.stationarySpeedMs ?? 0.4;

  let lastPostAt = 0;
  let lastPos = null;
  let inFlight = false;

  return async function publish(payload) {
    const now = Date.now();
    const speed = payload.speed;
    const isStationary =
      speed != null && Number.isFinite(speed) && speed < stationarySpeedMs;

    let movedEnough = true;
    if (lastPos && payload.lat != null && payload.lng != null) {
      const dLat = Math.abs(payload.lat - lastPos.lat);
      const dLng = Math.abs(payload.lng - lastPos.lng);
      const approxM = (dLat + dLng) * 111320;
      movedEnough = approxM >= minMoveM;
    }

    const interval = isStationary ? stationaryIntervalMs : minIntervalMs;
    if (now - lastPostAt < interval && !movedEnough) return;
    if (inFlight) return;

    inFlight = true;
    lastPostAt = now;
    lastPos = { lat: payload.lat, lng: payload.lng };

    try {
      await postFn(payload);
    } finally {
      inFlight = false;
    }
  };
}
