import React, { useEffect, useState, useRef, useMemo, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GoogleMap, useJsApiLoader, Marker } from "@react-google-maps/api";
import {
  MapPin,
  Navigation,
  Phone,
  MessageSquare,
  Shield,
  Clock,
  Star,
  Search,
  Loader2,
  Play,
  Square,
} from "lucide-react";
import customerPin from "@/assets/customer-pin.png";
import deliveryIcon from "@/assets/deliveryIcon.png";
import storePin from "@/assets/store-pin.png";

const libraries = ["geometry"];

const containerStyle = {
  width: "100%",
  height: "100%",
  minHeight: "350px",
};
const RECENTER_INTERVAL_MS = 15000;
const RIDER_FOCUS_RADIUS_M = 500;
const ROUTE_STROKE_COLOR = "#16a34a";
const ROUTE_SHADOW_COLOR = "#0d5c2a";

/** Delivery / rider search — not the same as waiting for seller acceptance */
const SEARCHING_STATUSES = [
  "pending",
  "confirmed",
  "delivery_search",
  "DELIVERY_SEARCH",
  "seller_accepted",
  "SELLER_ACCEPTED",
  "created",
  "CREATED",
];

function hasValidLatLng(location) {
  return (
    location &&
    typeof location.lat === "number" &&
    typeof location.lng === "number" &&
    Number.isFinite(location.lat) &&
    Number.isFinite(location.lng)
  );
}

const LiveTrackingMap = memo(({
  status = "out for delivery",
  eta = "8 mins",
  riderName = "Ramesh Kumar",
  riderLocation,
  sellerLocation,
  destinationLocation,
  routePhase = "pickup",
  routePolyline,
  onOpenInMaps,
  onOpenChat,
}) => {
  const mapRef = useRef(null);
  const routePolylineRef = useRef(null);
  const shadowPolylineRef = useRef(null);
  const [mapInstance, setMapInstance] = useState(null);
  const isSearching = SEARCHING_STATUSES.includes(status?.toLowerCase());
  const [progress, setProgress] = useState(0);
  const [dots, setDots] = useState("");
  const [simulationActive, setSimulationActive] = useState(false);
  const [simulationIndex, setSimulationIndex] = useState(0);
  const activeRiderLoc = riderLocation;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

  const [isFollowing, setIsFollowing] = useState(true);
  const isFollowingRef = useRef(isFollowing);
  useEffect(() => {
    isFollowingRef.current = isFollowing;
  }, [isFollowing]);



  const handleUserInteraction = useCallback(() => {
    if (isFollowingRef.current) {
      setIsFollowing(false);
    }
  }, []);

  const { isLoaded, loadError } = useJsApiLoader({
    id: "customer-tracking-map",
    googleMapsApiKey: apiKey,
    libraries,
  });

  useEffect(() => {
    console.log("[LiveTrackingMap Debug] FULL TRACKING STATE UPDATE:");
    console.log("[LiveTrackingMap Debug] 1. Rider Location:", riderLocation);
    console.log("[LiveTrackingMap Debug] 2. Destination:", destinationLocation);
    console.log("[LiveTrackingMap Debug] 3. Store/Seller:", sellerLocation);
    console.log("[LiveTrackingMap Debug] 4. Route Phase:", routePhase);
    console.log("[LiveTrackingMap Debug] 5. Is Map Loaded?:", isLoaded);
  }, [riderLocation, destinationLocation, sellerLocation, routePhase, isLoaded]);

  const onMapLoad = useCallback((map) => {
    mapRef.current = map;
    setMapInstance(map);
  }, []);

  const focusOnRider500m = useCallback((map, rider) => {
    if (!map || !window.google || !hasValidLatLng(rider)) return;
    const center = new window.google.maps.LatLng(rider.lat, rider.lng);
    const bounds = new window.google.maps.LatLngBounds();
    const offsets = [0, 90, 180, 270];
    offsets.forEach((heading) => {
      const point = window.google.maps.geometry.spherical.computeOffset(
        center,
        RIDER_FOCUS_RADIUS_M,
        heading,
      );
      bounds.extend(point);
    });
    map.fitBounds(bounds, 24);
  }, []);

  const activeTargetLocation = routePhase === "delivery" ? destinationLocation : sellerLocation;
  const shouldShowStoreMarker = hasValidLatLng(sellerLocation);
  const shouldShowCustomerMarker = hasValidLatLng(destinationLocation);

  // Decode polyline from Firebase
  const decodedPath = useMemo(() => {
    if (!routePolyline?.polyline || !isLoaded || !window.google?.maps?.geometry?.encoding) {
      if (routePolyline && !routePolyline.polyline) {
        console.log("[LiveTrackingMap] Route data exists but no polyline:", routePolyline);
      }
      return null;
    }
    try {
      const decoded = window.google.maps.geometry.encoding.decodePath(routePolyline.polyline);
      console.log(`[LiveTrackingMap] ✓ Decoded polyline with ${decoded.length} points`);
      return decoded;
    } catch (err) {
      console.error("[LiveTrackingMap] Error decoding polyline:", err);
      return null;
    }
  }, [routePolyline, isLoaded]);

  const riderMarkerIcon = useMemo(() => {
    if (!isLoaded || !window.google?.maps) return undefined;
    return {
      url: deliveryIcon,
      scaledSize: new window.google.maps.Size(44, 64),
      anchor: new window.google.maps.Point(22, 32),
    };
  }, [isLoaded]);

  const customerMarkerIcon = useMemo(() => {
    if (!isLoaded || !window.google?.maps) return undefined;

    return {
      url: customerPin,
      scaledSize: new window.google.maps.Size(40, 40),
      anchor: new window.google.maps.Point(20, 40),
    };
  }, [isLoaded]);

  const storeMarkerIcon = useMemo(() => {
    if (!isLoaded || !window.google?.maps) return undefined;

    return {
      url: storePin,
      scaledSize: new window.google.maps.Size(40, 40),
      anchor: new window.google.maps.Point(20, 40),
    };
  }, [isLoaded]);

  // Calculate map center and bounds
  const mapCenter = useMemo(() => {
    if (activeRiderLoc) return activeRiderLoc;
    if (hasValidLatLng(activeTargetLocation)) return activeTargetLocation;
    return { lat: 20.5937, lng: 78.9629 };
  }, [activeTargetLocation, activeRiderLoc]);

  // --- NATIVE OVERLAY VIEW ---
  const nativeOverlayRef = useRef(null);
  
  useEffect(() => {
    if (!isLoaded || !mapInstance || !window.google?.maps) return;

    class SmoothOverlay extends window.google.maps.OverlayView {
      constructor(pos, heading) {
        super();
        this.position = pos;
        this.heading = heading || 0;
        this.div = null;
      }
      onAdd() {
        this.div = document.createElement("div");
        this.div.style.position = "absolute";
        this.div.style.width = "44px";
        this.div.style.height = "64px";
        this.div.style.transformOrigin = "center center";
        this.div.style.transition = "transform 0.1s linear"; 
        this.div.style.zIndex = "999";
        const img = document.createElement("img");
        img.src = deliveryIcon;
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "contain";
        this.div.appendChild(img);
        const panes = this.getPanes();
        panes.markerLayer.appendChild(this.div);
      }
      draw() {
        if (!this.div) return;
        const overlayProjection = this.getProjection();
        if (!overlayProjection || !this.position) return;
        const lat = typeof this.position.lat === 'function' ? this.position.lat() : this.position.lat;
        const lng = typeof this.position.lng === 'function' ? this.position.lng() : this.position.lng;
        const pos = overlayProjection.fromLatLngToDivPixel(
          new window.google.maps.LatLng(lat, lng)
        );
        if (pos) {
          this.div.style.left = (pos.x - 22) + "px";
          this.div.style.top = (pos.y - 32) + "px";
          this.div.style.transform = `rotate(${this.heading}deg)`;
        }
      }
      onRemove() {
        if (this.div && this.div.parentNode) {
          this.div.parentNode.removeChild(this.div);
          this.div = null;
        }
      }
      updatePosition(newPos, newHeading) {
        this.position = newPos;
        if (newHeading !== undefined) this.heading = newHeading;
        this.draw(); 
      }
    }

    if (riderLocation && hasValidLatLng(riderLocation)) {
      if (!nativeOverlayRef.current) {
        nativeOverlayRef.current = new SmoothOverlay(riderLocation, riderLocation.heading || 0);
        nativeOverlayRef.current.setMap(mapInstance);
      } else if (nativeOverlayRef.current.getMap && nativeOverlayRef.current.getMap() !== mapInstance) {
        nativeOverlayRef.current.setMap(mapInstance);
      }
    }
  }, [isLoaded, mapInstance, riderLocation]); // riderLocation added so it initializes when location first arrives

  // --- LIVE TRACKING SMOOTH INTERPOLATION ---
  const liveAnimationRef = useRef(null);

  useEffect(() => {
    if (simulationActive || !isLoaded || !mapInstance || !window.google?.maps || !nativeOverlayRef.current) return;

    if (!hasValidLatLng(riderLocation)) return;
    console.log("[LiveTrackingMap] Live tracking effect triggered with new rider location:", riderLocation);

    const currentPos = nativeOverlayRef.current.position;
    const currentLat = typeof currentPos.lat === 'function' ? currentPos.lat() : currentPos.lat;
    const currentLng = typeof currentPos.lng === 'function' ? currentPos.lng() : currentPos.lng;
    
    console.log(`[LiveTrackingMap] Current Overlay Position parsed - lat: ${currentLat}, lng: ${currentLng}`);
    
    const newPos = new window.google.maps.LatLng(riderLocation.lat, riderLocation.lng);
    const startPos = new window.google.maps.LatLng(currentLat, currentLng);

    if (!window.google.maps.geometry?.spherical) {
      console.warn("[LiveTrackingMap] Spherical geometry library not loaded, updating position directly.");
      nativeOverlayRef.current.updatePosition({ lat: riderLocation.lat, lng: riderLocation.lng }, riderLocation.heading || 0);
      return;
    }

    const dist = window.google.maps.geometry.spherical.computeDistanceBetween(startPos, newPos);
    console.log(`[LiveTrackingMap] Computed distance to new position: ${dist.toFixed(2)} meters`);
    
    if (dist < 1) return; // already there

    let targetHeading = riderLocation.heading;
    if (targetHeading === undefined || targetHeading === null) {
      targetHeading = window.google.maps.geometry.spherical.computeHeading(startPos, newPos);
    }

    if (dist > 500) {
      // Teleport instantly if distance is huge
      console.log("[LiveTrackingMap] Distance > 500m, teleporting marker instantly.");
      if (liveAnimationRef.current) {
        cancelAnimationFrame(liveAnimationRef.current);
        liveAnimationRef.current = null;
      }
      nativeOverlayRef.current.updatePosition({ lat: riderLocation.lat, lng: riderLocation.lng }, targetHeading);
    } else {
      console.log(`[LiveTrackingMap] Animating marker to new position over 2000ms`);
      if (liveAnimationRef.current) {
        cancelAnimationFrame(liveAnimationRef.current);
      }

      const durationMs = 2000;
      let startTime = performance.now();
      let currentCameraHeading = mapRef.current?.getHeading() || nativeOverlayRef.current.heading || 0;

      const animate = (time) => {
        let elapsed = time - startTime;
        let fraction = elapsed / durationMs;
        if (fraction >= 1) fraction = 1;

        const easeFraction = fraction < 0.5 ? 2 * fraction * fraction : 1 - Math.pow(-2 * fraction + 2, 2) / 2;
        const interpolated = window.google.maps.geometry.spherical.interpolate(
          startPos,
          newPos,
          easeFraction
        );
        const interpLatLng = { lat: interpolated.lat(), lng: interpolated.lng() };

        let headingDiff = targetHeading - currentCameraHeading;
        if (headingDiff > 180) headingDiff -= 360;
        if (headingDiff < -180) headingDiff += 360;
        currentCameraHeading += headingDiff * 0.1;

        nativeOverlayRef.current.updatePosition(interpLatLng, currentCameraHeading);

        if (mapRef.current && isFollowingRef.current) {
          mapRef.current.moveCamera({ center: interpLatLng, heading: currentCameraHeading, tilt: 45, zoom: 17 });
        }

        // Update polyline dynamically for smooth tracking
        if (routePolylineRef.current && decodedPath && decodedPath.length > 0) {
          let minDistance = Infinity;
          let closestIdx = 0;
          for (let i = 0; i < decodedPath.length; i++) {
            const d = window.google.maps.geometry.spherical.computeDistanceBetween(interpLatLng, decodedPath[i]);
            if (d < minDistance) {
              minDistance = d;
              closestIdx = i;
            }
          }
          const dynamicPath = [interpLatLng, ...decodedPath.slice(closestIdx)];
          routePolylineRef.current.setPath(dynamicPath);
        }

        if (fraction < 1) {
          liveAnimationRef.current = requestAnimationFrame(animate);
        }
      };

      liveAnimationRef.current = requestAnimationFrame(animate);
    }

    // Polyline update is now handled inside the animate function

    return () => {
      if (liveAnimationRef.current) {
        cancelAnimationFrame(liveAnimationRef.current);
      }
    };
  }, [riderLocation, isLoaded, mapInstance, decodedPath, simulationActive]);

  // LOCAL SIMULATION LOGIC (Overrides live tracking when active)
  useEffect(() => {
    if (!simulationActive || !isLoaded || !mapInstance || !window.google?.maps || !decodedPath || decodedPath.length === 0 || !nativeOverlayRef.current) return;

    let currentSegment = simulationIndex || 0;
    let startTime = performance.now();
    let animationFrameId;
    let currentCameraHeading = nativeOverlayRef.current.heading || 0;
    
    // Set simulated speed: ~60 km/h = 16.6 m/s
    const speedMetersPerMs = 16.6 / 1000; 

    // Move rider exactly to start point immediately
    if (currentSegment === 0) {
      const startPt = decodedPath[0];
      const initialRider = { lat: startPt.lat(), lng: startPt.lng() };
      nativeOverlayRef.current.updatePosition(initialRider, currentCameraHeading);
    }

    const animate = (time) => {
      if (currentSegment >= decodedPath.length - 1) {
        setSimulationActive(false);
        return;
      }

      const p1 = decodedPath[currentSegment];
      const p2 = decodedPath[currentSegment + 1];
      
      const dist = window.google?.maps?.geometry?.spherical?.computeDistanceBetween(p1, p2) || 0;
      const durationMs = dist > 0 ? dist / speedMetersPerMs : 0;
      
      let elapsed = time - startTime;
      let fraction = durationMs > 0 ? elapsed / durationMs : 1;
      
      if (fraction >= 1) {
        currentSegment++;
        setSimulationIndex(currentSegment);
        startTime = time;
        fraction = 0;
      }
      
      if (currentSegment < decodedPath.length - 1) {
        const nextP1 = decodedPath[currentSegment];
        const nextP2 = decodedPath[currentSegment + 1];
        
        if (window.google?.maps?.geometry?.spherical) {
          const newPos = window.google.maps.geometry.spherical.interpolate(nextP1, nextP2, fraction);
          const newRider = { lat: newPos.lat(), lng: newPos.lng() };
          
          const targetHeading = window.google.maps.geometry.spherical.computeHeading(nextP1, nextP2);
          let headingDiff = targetHeading - currentCameraHeading;
          if (headingDiff > 180) headingDiff -= 360;
          if (headingDiff < -180) headingDiff += 360;
          currentCameraHeading += headingDiff * 0.08;
          
          nativeOverlayRef.current.updatePosition(newRider, targetHeading);

          if (mapRef.current && isFollowingRef.current) {
            mapRef.current.moveCamera({ center: newRider, heading: currentCameraHeading, tilt: 45, zoom: 17 });
          }
          
          // Truncate polyline to simulate moving along it
          if (routePolylineRef.current) {
             const dynamicPath = [newPos, ...decodedPath.slice(currentSegment + 1)];
             routePolylineRef.current.setPath(dynamicPath);
             if (shadowPolylineRef.current) shadowPolylineRef.current.setPath(dynamicPath);
          }
        }
        animationFrameId = requestAnimationFrame(animate);
      } else {
        setSimulationActive(false);
      }
    };
    
    animationFrameId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrameId);
  }, [simulationActive, decodedPath, isLoaded, mapInstance]);

  // Draw native polylines (shadow + route) via refs — avoids React <Polyline> duplicate overlay issues
  useEffect(() => {
    if (!isLoaded || !mapInstance || !window.google?.maps) return undefined;

    // Determine the path to draw - NO STRAIGHT LINE FALLBACKS just like delivery map
    let pathToDraw = [];

    if (decodedPath && decodedPath.length > 0) {
      if (simulationActive && typeof simulationIndex === 'number') {
        pathToDraw = decodedPath.slice(simulationIndex);
      } else if (activeRiderLoc && window.google.maps.geometry?.spherical) {
        const riderLatLng = new window.google.maps.LatLng(activeRiderLoc.lat, activeRiderLoc.lng);
        let minDistance = Infinity;
        let closestIdx = 0;

        for (let i = 0; i < decodedPath.length; i++) {
          const d = window.google.maps.geometry.spherical.computeDistanceBetween(riderLatLng, decodedPath[i]);
          if (d < minDistance) {
            minDistance = d;
            closestIdx = i;
          }
        }
        pathToDraw = [riderLatLng, ...decodedPath.slice(closestIdx)];
      } else {
        pathToDraw = decodedPath;
      }
    }

    if (!pathToDraw || pathToDraw.length < 2) {
      // Clear if not enough points
      if (routePolylineRef.current) routePolylineRef.current.setMap(null);
      routePolylineRef.current = null;
      return undefined;
    }

    // No shadow polyline to match delivery app exactly

    // Main route polyline exactly matching delivery app
    if (!routePolylineRef.current) {
      routePolylineRef.current = new window.google.maps.Polyline({
        path: pathToDraw,
        strokeColor: "#2563eb",
        strokeOpacity: 0.95,
        strokeWeight: 5,
        map: mapInstance,
        zIndex: 10,
        geodesic: false,
      });
    } else {
      routePolylineRef.current.setPath(pathToDraw);
    }

    return () => {
      // Only clean up on unmount or map change, don't destroy on every path update
    };
  }, [isLoaded, mapInstance, decodedPath, activeRiderLoc, activeTargetLocation]);

  // Cleanup polylines and overlays on complete unmount
  useEffect(() => {
    return () => {
      if (shadowPolylineRef.current) {
        shadowPolylineRef.current.setMap(null);
        shadowPolylineRef.current = null;
      }
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
        routePolylineRef.current = null;
      }
      if (nativeOverlayRef.current) {
        nativeOverlayRef.current.setMap(null);
        nativeOverlayRef.current = null;
      }
    };
  }, []);

  // Fit bounds or initial center like delivery boy
  const hasInitialCenteredRef = useRef(false);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;

    if (!hasInitialCenteredRef.current) {
      if (riderLocation) {
        map.moveCamera({
          center: riderLocation,
          heading: riderLocation.heading || 0,
          tilt: 45,
          zoom: 17
        });
        hasInitialCenteredRef.current = true;
        return;
      }

      try {
        const bounds = new window.google.maps.LatLngBounds();
        let hasPoints = false;

        if (decodedPath && decodedPath.length > 0) {
          decodedPath.forEach((point) => bounds.extend(point));
          hasPoints = true;
        }

        if (hasValidLatLng(activeTargetLocation)) {
          bounds.extend(activeTargetLocation);
          hasPoints = true;
        }

        if (hasPoints) {
          map.fitBounds(bounds, { top: 80, bottom: 80, left: 40, right: 40 });
        } else if (hasValidLatLng(sellerLocation) && hasValidLatLng(destinationLocation)) {
          bounds.extend(sellerLocation);
          bounds.extend(destinationLocation);
          map.fitBounds(bounds, { top: 80, bottom: 80, left: 40, right: 40 });
        }
        hasInitialCenteredRef.current = true;
      } catch (err) {
        console.error("Error fitting bounds:", err);
      }
    }
  }, [activeTargetLocation, decodedPath, riderLocation, sellerLocation, destinationLocation]);

  // Snap to rider instantly when 'Re-center' is clicked
  useEffect(() => {
    if (isFollowing && hasInitialCenteredRef.current && mapRef.current && riderLocation && window.google) {
        mapRef.current.moveCamera({ center: riderLocation, heading: riderLocation.heading || 0, tilt: 45, zoom: 17 });
    }
  }, [isFollowing]);



  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => (prev + 0.5) % 100);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isSearching) return;
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 500);
    return () => clearInterval(interval);
  }, [isSearching]);

  const norm = status?.toLowerCase?.() || "";
  if (norm === "cancelled" || norm === "canceled") {
    return (
      <div className="relative w-full min-h-[220px] bg-gradient-to-br from-slate-100 to-slate-50 overflow-hidden rounded-b-[2rem] flex flex-col items-center justify-center gap-3 px-6 py-10 border-b border-slate-200">
        <div className="h-14 w-14 rounded-full bg-slate-200 flex items-center justify-center text-slate-600">
          <Clock size={28} />
        </div>
        <h3 className="text-lg font-black text-slate-800 text-center">
          Order cancelled
        </h3>
        <p className="text-sm text-slate-500 text-center max-w-sm font-medium">
          This order is closed. If payment was reserved, any applicable refund
          follows your store policy.
        </p>
      </div>
    );
  }

  if (norm === "seller_pending") {
    return (
      <div className="relative w-full min-h-[260px] bg-gradient-to-br from-[#f0faf4] to-[#e8f5e9] overflow-hidden rounded-b-[2rem] flex flex-col items-center justify-center gap-3 px-6 py-10 border-b border-brand-100">
        <motion.div
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="h-16 w-16 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-brand-200">
          <Clock size={30} className="text-white" />
        </motion.div>
        <h3 className="text-lg font-black text-gray-800 text-center">
          Waiting for seller to accept
        </h3>
        <p className="text-sm text-gray-500 text-center max-w-sm font-medium">
          The store has up to 60 seconds to confirm. If they don&apos;t, your
          order will be cancelled automatically.
        </p>
      </div>
    );
  }

  // ─── SEARCHING STATE ───────────────────────────────────────────────────
  if (isSearching) {
    return (
      <div className="relative w-full h-[320px] bg-gradient-to-br from-[#f0faf4] to-[#e8f5e9] overflow-hidden rounded-b-[2rem] flex flex-col items-center justify-center gap-4">
        {/* Animated radar rings */}
        {[1, 2, 3].map((i) => (
          <motion.div
            key={i}
            className="absolute rounded-full border-2 border-primary/20"
            initial={{ width: 60, height: 60, opacity: 0.8 }}
            animate={{ width: 60 + i * 70, height: 60 + i * 70, opacity: 0 }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.5,
              ease: "easeOut",
            }}
          />
        ))}

        {/* Center dot */}
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="relative z-10 h-16 w-16 bg-primary rounded-full flex items-center justify-center shadow-xl shadow-brand-200">
          <Search size={28} className="text-white" />
        </motion.div>

        {/* Text */}
        <div className="relative z-10 text-center px-6">
          <h3 className="text-lg font-black text-gray-800">
            Searching for delivery partner{dots}
          </h3>
          <p className="text-sm text-gray-500 mt-1 font-medium">
            Hang tight! We're finding the best rider near you.
          </p>
        </div>

        {/* Status pill */}
        <motion.div
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="relative z-10 bg-white px-4 py-2 rounded-full shadow-md border border-brand-100 flex items-center gap-2">
          <div className="h-2 w-2 bg-brand-500 rounded-full animate-pulse" />
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">
            {status === "confirmed"
              ? "Order Confirmed · Assigning Rider"
              : "Order Placed · Finding Rider"}
          </span>
        </motion.div>
      </div>
    );
  }

  // ─── LIVE TRACKING STATE ───────────────────────────────────────────────

  // If Google Maps is not loaded or no API key
  if (!apiKey) {
    return (
      <div className="relative w-full h-[350px] bg-slate-100 rounded-b-[2rem] flex items-center justify-center text-center px-4">
        <p className="text-xs text-slate-500">
          Set <code className="font-mono">VITE_GOOGLE_MAPS_API_KEY</code> to show live tracking.
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="relative w-full h-[350px] bg-rose-50 rounded-b-[2rem] flex items-center justify-center text-xs text-rose-700 px-4">
        Map failed to load. Check the API key and billing.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="relative w-full h-[350px] bg-slate-50 rounded-b-[2rem] flex items-center justify-center">
        <Loader2 className="animate-spin text-brand-600" size={28} />
      </div>
    );
  }

  return (
    <div 
      className="relative w-full h-[350px] bg-[#E5E3DF] overflow-hidden rounded-b-[2rem] shadow-md border-b border-gray-200"
      onMouseDownCapture={handleUserInteraction}
      onTouchStartCapture={handleUserInteraction}
      onWheelCapture={handleUserInteraction}
    >
      {/* Google Map */}
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={mapCenter}
        zoom={14}
        onLoad={onMapLoad}
        options={{
          mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID",
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          tilt: 45,
        }}
      >
        {/* Rider Location Marker is now fully managed natively by liveMarkerRef and simMarkerRef to bypass React render latency */}

        {/* Store Marker */}
        {shouldShowStoreMarker && (
          <Marker
            position={sellerLocation}
            title="Store Location"
            icon={storeMarkerIcon}
          />
        )}

        {/* Destination Marker */}
        {shouldShowCustomerMarker && (
          <Marker
            position={destinationLocation}
            title="Your Location"
            icon={customerMarkerIcon}
          />
        )}

        {/* Polyline is drawn via native google.maps.Polyline refs (see useEffect above) */}
      </GoogleMap>

      {/* 3. Floating Overlay Cards */}
      <div className="absolute top-4 left-4 z-40">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-white/95 backdrop-blur-md rounded-xl py-1.5 px-3 shadow-md border border-white/50 flex items-center gap-2">
          <div className="h-6 w-6 bg-brand-50 rounded-lg flex items-center justify-center text-primary">
            <Clock size={14} strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
              Arriving in
            </p>
            <h2 className="text-sm font-black text-gray-900 leading-none">
              {eta}
            </h2>
          </div>
        </motion.div>
      </div>

      {/* 3.5. Simulation Control (Dev Only / Local Testing) */}
      {!simulationActive && decodedPath?.length > 0 && (
        <div className="absolute top-16 left-4 z-40">
          <button
            onClick={() => setSimulationActive(true)}
            className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-md hover:bg-brand-700 transition-colors"
          >
            ▶ Simulate Live Tracking
          </button>
        </div>
      )}

      {/* 4. Rider Info Card (Compact Bottom) */}
      {riderName && (
        <div className="absolute bottom-2 left-2 right-2 z-40">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-white/95 backdrop-blur-md rounded-2xl p-3 shadow-lg border border-white/50">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="h-10 w-10 rounded-full bg-gray-100 overflow-hidden border-2 border-white shadow-sm">
                  <img
                    src="https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=100&auto=format&fit=crop&q=60"
                    alt="Rider"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 bg-primary text-primary-foreground text-[7px] font-bold px-1 py-0.5 rounded-full flex items-center gap-0.5">
                  4.8 <Star size={5} fill="white" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-gray-900 text-xs truncate">{riderName}</h3>
                <p className="text-[10px] text-gray-500 flex items-center gap-1">
                  <Shield size={8} />
                  Vaccinated
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button className="h-8 w-8 rounded-full bg-brand-50 flex items-center justify-center text-primary hover:bg-brand-100 transition-colors">
                  <Phone size={14} />
                </button>
                <button
                  onClick={onOpenChat}
                  className="h-8 w-8 rounded-full bg-brand-50 flex items-center justify-center text-brand-600 hover:bg-brand-100 transition-colors"
                >
                  <MessageSquare size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Location status indicator */}
      {!activeRiderLoc && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 bg-amber-50/95 text-amber-900 text-xs px-3 py-2 rounded-lg border border-amber-200 shadow-sm">
          Waiting for rider location...
        </div>
      )}

      {/* Route cache indicator */}
      {routePolyline && (
        <div className="absolute bottom-2 right-2 bg-white/95 backdrop-blur px-2 py-1 rounded-md text-[10px] text-slate-600 font-bold border border-slate-200 shadow-sm">
          Route cached • Reduced API cost
        </div>
      )}


    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for memo
  // Only re-render if these props actually change
  return (
    prevProps.status === nextProps.status &&
    prevProps.eta === nextProps.eta &&
    prevProps.riderName === nextProps.riderName &&
    prevProps.riderLocation?.lat === nextProps.riderLocation?.lat &&
    prevProps.riderLocation?.lng === nextProps.riderLocation?.lng &&
    prevProps.sellerLocation?.lat === nextProps.sellerLocation?.lat &&
    prevProps.sellerLocation?.lng === nextProps.sellerLocation?.lng &&
    prevProps.destinationLocation?.lat === nextProps.destinationLocation?.lat &&
    prevProps.destinationLocation?.lng === nextProps.destinationLocation?.lng &&
    prevProps.routePhase === nextProps.routePhase &&
    prevProps.routePolyline?.phase === nextProps.routePolyline?.phase &&
    prevProps.routePolyline?.polyline === nextProps.routePolyline?.polyline &&
    prevProps.routePolyline?.cachedAt === nextProps.routePolyline?.cachedAt
  );
});

LiveTrackingMap.displayName = 'LiveTrackingMap';

export default LiveTrackingMap;

