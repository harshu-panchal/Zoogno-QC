import React, { useState, useCallback, useEffect } from "react";
import Map, { Marker } from "react-map-gl/mapbox";
import { Search, MapPin, Navigation, Loader2 } from "lucide-react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import Input from "./ui/Input";
import {
  getMapboxAccessToken,
  getMapboxStyleUrl,
  initMapbox,
  isMapboxConfigured,
} from "@/core/services/mapboxLoader";

initMapbox();

const defaultCenter = { lat: 20.5937, lng: 78.9629 };

const MapPicker = ({
  isOpen,
  onClose,
  onConfirm,
  initialLocation = null,
  initialRadius = 5,
  maxRadius = 20,
  preferCurrentLocationOnOpen = false,
  geocodeFn = null,
}) => {
  const [marker, setMarker] = useState(initialLocation);
  const [radius, setRadius] = useState(initialRadius);
  const [search, setSearch] = useState("");
  const [address, setAddress] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);

  const token = getMapboxAccessToken();
  const styleUrl = getMapboxStyleUrl();

  useEffect(() => {
    if (initialLocation) setMarker(initialLocation);
  }, [initialLocation]);

  useEffect(() => {
    if (!isOpen) return;
    setRadius(initialRadius);
    if (preferCurrentLocationOnOpen && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setMarker({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {},
        { enableHighAccuracy: true, timeout: 15000 },
      );
    } else if (initialLocation) {
      setMarker(initialLocation);
    }
  }, [isOpen, initialLocation, initialRadius, preferCurrentLocationOnOpen]);

  const reverseGeocode = useCallback(
    async (lat, lng) => {
      if (!geocodeFn) {
        setAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        return { locality: "", city: "", state: "", pincode: "" };
      }
      setIsGeocoding(true);
      try {
        const res = await geocodeFn({ lat, lng });
        const formatted =
          res?.data?.result?.formattedAddress ||
          res?.data?.data?.formattedAddress ||
          "";
        setAddress(formatted);
        return {
          locality: formatted,
          city: "",
          state: "",
          pincode: "",
          formattedAddress: formatted,
        };
      } finally {
        setIsGeocoding(false);
      }
    },
    [geocodeFn],
  );

  const onMapClick = useCallback(
    async (evt) => {
      const { lat, lng } = evt.lngLat;
      const pos = { lat, lng };
      setMarker(pos);
      await reverseGeocode(lat, lng);
    },
    [reverseGeocode],
  );

  const handleSearch = async () => {
    if (!search.trim() || !geocodeFn) return;
    setIsGeocoding(true);
    try {
      const res = await geocodeFn({ address: search.trim() });
      const loc = res?.data?.result?.location || res?.data?.data?.location;
      if (loc?.lat != null && loc?.lng != null) {
        setMarker({ lat: loc.lat, lng: loc.lng });
        setAddress(
          res?.data?.result?.formattedAddress ||
            res?.data?.data?.formattedAddress ||
            search,
        );
      }
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleConfirm = async () => {
    if (!marker) return;
    const details = await reverseGeocode(marker.lat, marker.lng);
    onConfirm?.({
      lat: marker.lat,
      lng: marker.lng,
      address: address || details.formattedAddress || "",
      locality: details.locality,
      city: details.city,
      state: details.state,
      pincode: details.pincode,
      radius,
    });
    onClose?.();
  };

  const viewState = marker
    ? { longitude: marker.lng, latitude: marker.lat, zoom: 15 }
    : { longitude: defaultCenter.lng, latitude: defaultCenter.lat, zoom: 4 };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Pick location" size="lg">
      {!token || !isMapboxConfigured() ? (
        <p className="text-sm text-slate-500 p-4">
          Configure <code>VITE_MAPBOX_ACCESS_TOKEN</code> to use the map picker.
        </p>
      ) : (
        <>
          <div className="flex gap-2 mb-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search address…"
              icon={Search}
            />
            <Button type="button" onClick={handleSearch} disabled={isGeocoding}>
              Search
            </Button>
          </div>
          <div className="rounded-xl overflow-hidden border border-slate-200 h-[340px]">
            <Map
              mapboxAccessToken={token}
              mapStyle={styleUrl}
              initialViewState={viewState}
              onClick={onMapClick}
              style={{ width: "100%", height: "100%" }}
              cursor="crosshair"
            >
              {marker && (
                <Marker latitude={marker.lat} longitude={marker.lng} anchor="bottom">
                  <MapPin className="text-green-600 w-8 h-8 drop-shadow" />
                </Marker>
              )}
            </Map>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <label className="text-xs font-bold text-slate-500">Radius (km)</label>
            <input
              type="range"
              min={1}
              max={maxRadius}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="flex-1"
            />
            <span className="text-sm font-bold">{radius} km</span>
          </div>
          {address && (
            <p className="text-xs text-slate-600 mt-2 flex items-start gap-1">
              <Navigation size={14} className="shrink-0 mt-0.5" />
              {address}
            </p>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={!marker || isGeocoding}>
              {isGeocoding ? (
                <Loader2 className="animate-spin w-4 h-4" />
              ) : (
                "Confirm"
              )}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
};

export default MapPicker;
