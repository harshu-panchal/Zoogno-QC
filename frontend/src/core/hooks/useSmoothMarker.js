import { useEffect, useRef, useState } from "react";
import { easeInOutQuad, interpolatePosition } from "@/core/utils/mapGeometry.js";

/**
 * Smoothly animates marker from GPS point A → B (Blinkit-style).
 */
export function useSmoothMarker(target, { durationMs = 2800 } = {}) {
  const [display, setDisplay] = useState(target);
  const frameRef = useRef(null);
  const fromRef = useRef(target);
  const displayRef = useRef(target);

  useEffect(() => {
    displayRef.current = display;
  }, [display]);

  useEffect(() => {
    if (!target?.lat || !target?.lng) return;

    const from = displayRef.current || target;
    const dist =
      Math.abs(from.lat - target.lat) + Math.abs(from.lng - target.lng);
    if (dist < 1e-6) {
      setDisplay(target);
      return;
    }

    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    fromRef.current = from;
    const start = performance.now();

    const tick = (now) => {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = easeInOutQuad(t);
      const next = interpolatePosition(fromRef.current, target, eased);
      setDisplay(next);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target?.lat, target?.lng, durationMs]);

  return display;
}
