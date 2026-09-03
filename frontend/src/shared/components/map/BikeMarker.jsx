import { useRef } from "react";
import { Marker } from "react-map-gl/mapbox";
import deliveryIcon from "@/assets/deliveryIcon.png";
import { getContinuousBearing } from "@/core/utils/mapGeometry.js";

/** Zoogno delivery bike marker with bearing rotation. */
export default function BikeMarker({ latitude, longitude, bearing = 0, size = 44 }) {
  const currentBearingRef = useRef(bearing || 0);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const targetBearing = Number.isFinite(bearing) ? bearing : 0;
  const smoothAngle = getContinuousBearing(currentBearingRef.current, targetBearing);
  currentBearingRef.current = smoothAngle;

  return (
    <Marker latitude={latitude} longitude={longitude} anchor="center">
      <div
        style={{
          width: size,
          height: size * 1.45,
          transform: `rotate(${smoothAngle}deg)`,
          transformOrigin: "center center",
          transition: "transform 0.3s ease-out",
          willChange: "transform",
          pointerEvents: "none",
        }}
      >
        <img
          src={deliveryIcon}
          alt="Delivery partner"
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
          draggable={false}
        />
      </div>
    </Marker>
  );
}
