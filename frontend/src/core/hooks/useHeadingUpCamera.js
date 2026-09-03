import { useCallback, useEffect, useRef } from "react";
import { shortestAngleDelta } from "@/core/utils/mapGeometry.js";

/**
 * Heading-up camera follow for delivery navigation.
 * Pauses when user drags; re-center restores follow.
 */
export function useHeadingUpCamera({
  mapRef,
  target,
  bearing,
  enabled,
  zoom = 17,
  pitch = 55,
  paddingBottom = 120,
}) {
  const bearingRef = useRef(bearing || 0);
  const enabledRef = useRef(enabled);
  const userInteractedRef = useRef(false);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    bearingRef.current = bearing || 0;
  }, [bearing]);

  const pauseFollow = useCallback(() => {
    userInteractedRef.current = true;
  }, []);

  const recenter = useCallback(() => {
    userInteractedRef.current = false;
    const map = mapRef.current?.getMap?.() || mapRef.current;
    if (!map || !target) return;
    const delta = shortestAngleDelta(map.getBearing(), bearingRef.current);
    map.easeTo({
      center: [target.lng, target.lat],
      bearing: map.getBearing() + delta * 0.35,
      pitch,
      zoom,
      padding: { bottom: paddingBottom, top: 40, left: 24, right: 24 },
      duration: 600,
    });
  }, [mapRef, target, pitch, zoom, paddingBottom]);

  useEffect(() => {
    const map = mapRef.current?.getMap?.() || mapRef.current;
    if (!map || !target || !enabledRef.current || userInteractedRef.current) {
      return;
    }

    const delta = shortestAngleDelta(map.getBearing(), bearingRef.current);
    map.easeTo({
      center: [target.lng, target.lat],
      bearing: map.getBearing() + delta * 0.08,
      pitch,
      zoom,
      padding: { bottom: paddingBottom, top: 40, left: 24, right: 24 },
      duration: 300,
      essential: true,
    });
  }, [target?.lat, target?.lng, bearing, mapRef, enabled, pitch, zoom, paddingBottom]);

  useEffect(() => {
    const map = mapRef.current?.getMap?.() || mapRef.current;
    if (!map) return;
    const onDragStart = () => pauseFollow();
    map.on("dragstart", onDragStart);
    return () => map.off("dragstart", onDragStart);
  }, [mapRef, pauseFollow]);

  return { pauseFollow, recenter, isFollowing: !userInteractedRef.current };
}
