import { useRef } from "react";
import { Marker } from "react-map-gl/mapbox";
import deliveryIcon from "@/assets/deliveryIcon.png";
import { getContinuousBearing } from "@/core/utils/mapGeometry.js";

/** Zoogno delivery bike marker with bearing rotation. */
export default function BikeMarker({ latitude, longitude, bearing = 0, size = 48 }) {
  const currentBearingRef = useRef(bearing || 0);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const targetBearing = Number.isFinite(bearing) ? bearing : 0;
  const smoothAngle = getContinuousBearing(currentBearingRef.current, targetBearing);
  currentBearingRef.current = smoothAngle;

  return (
    <Marker
      latitude={latitude}
      longitude={longitude}
      anchor="center"
      rotation={smoothAngle}
      rotationAlignment="map"
      pitchAlignment="map"
    >
      <div
        className="flex items-center justify-center"
        style={{
          width: size,
          height: size,
          pointerEvents: "none",
        }}
      >
        <img
          src={deliveryIcon}
          alt="Delivery partner"
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
          }}
          draggable={false}
        />
      </div>
    </Marker>
  );
}
