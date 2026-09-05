import React, { useState, useCallback, useEffect, useMemo } from "react";
import Map, { Marker, Source, Layer } from "react-map-gl/mapbox";
import { Search, MapPin, Navigation, Loader2, AlertTriangle, ShieldCheck } from "lucide-react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import Input from "./ui/Input";
import {
  getMapboxAccessToken,
  getMapboxStyleUrl,
  initMapbox,
  isMapboxConfigured,
} from "@/core/services/mapboxLoader";
import {
  findZoneContainingPoint,
  isPointInAnyZone,
  zonesGeoJson,
} from "@shared/components/map/SellerLocationMap";

initMapbox();

const defaultCenter = { lat: 20.5937, lng: 78.9629 };

const MapPicker = ({
  isOpen,
  onClose,
  onConfirm,
  initialLocation = null,
  initialRadius = 5,
  initialZone = "",
  maxRadius = 20,
  preferCurrentLocationOnOpen = false,
  geocodeFn = null,
  zones = [],
}) => {
  const [marker, setMarker] = useState(initialLocation);
  const [radius, setRadius] = useState(initialRadius);
  const [search, setSearch] = useState("");
  const [address, setAddress] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [selectedZone, setSelectedZone] = useState(initialZone || "");

  const token = getMapboxAccessToken();
  const styleUrl = getMapboxStyleUrl();
  const hasZones = Array.isArray(zones) && zones.length > 0;
  const zoneData = useMemo(() => zonesGeoJson(zones), [zones]);
  const isInsideZone = useMemo(() => {
    if (!hasZones || !marker) return true;
    if (selectedZone) {
      const selected = zones.find((z) => String(z._id) === String(selectedZone));
      return selected ? !!findZoneContainingPoint(marker.lat, marker.lng, [selected]) : false;
    }
    return isPointInAnyZone(marker.lat, marker.lng, zones);
  }, [hasZones, marker, selectedZone, zones]);

  const applyMarker = useCallback((pos) => {
    setMarker(pos);
    if (hasZones && pos) {
      const containing = findZoneContainingPoint(pos.lat, pos.lng, zones);
      if (containing?._id) {
        setSelectedZone(String(containing._id));
      }
    }
  }, [hasZones, zones]);

  const getZoneCenter = useCallback((zoneId) => {
    const z = zones.find((x) => String(x._id) === String(zoneId));
    if (z?.location?.coordinates?.[0]) {
      const ring = z.location.coordinates[0];
      if (ring.length > 0) {
        let sumLat = 0;
        let sumLng = 0;
        ring.forEach((pt) => {
          sumLng += pt[0];
          sumLat += pt[1];
        });
        return { lat: sumLat / ring.length, lng: sumLng / ring.length };
      }
    }
    return null;
  }, [zones]);

  useEffect(() => {
    if (initialLocation) setMarker(initialLocation);
  }, [initialLocation]);

  useEffect(() => {
    if (!isOpen) return;
    setRadius(initialRadius);
    setSelectedZone(initialZone || "");
    
    if (initialLocation) {
      applyMarker(initialLocation);
    } else if (initialZone && hasZones) {
      const center = getZoneCenter(initialZone);
      if (center) {
        applyMarker(center);
        reverseGeocode(center.lat, center.lng);
      }
    } else if (preferCurrentLocationOnOpen && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          applyMarker({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        },
        () => {},
        { enableHighAccuracy: true, timeout: 15000 },
      );
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !hasZones || !marker) return;
    const containing = findZoneContainingPoint(marker.lat, marker.lng, zones);
    if (containing?._id && !selectedZone) {
      setSelectedZone(String(containing._id));
    }
  }, [isOpen, hasZones, zones, marker, selectedZone]);

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
      } catch (error) {
        console.warn("Geocoding error, proceeding without address details", error);
        setAddress("");
        return { locality: "", city: "", state: "", pincode: "", formattedAddress: "" };
      } finally {
        setIsGeocoding(false);
      }
    },
    [geocodeFn],
  );

  const onMapClick = useCallback(
    async (evt) => {
      const { lat, lng } = evt.lngLat;
      applyMarker({ lat, lng });
      await reverseGeocode(lat, lng);
    },
    [applyMarker, reverseGeocode],
  );

  const handleSearch = async () => {
    if (!search.trim() || !geocodeFn) return;
    setIsGeocoding(true);
    try {
      const res = await geocodeFn({ address: search.trim() });
      const loc = res?.data?.result?.location || res?.data?.data?.location;
      if (loc?.lat != null && loc?.lng != null) {
        applyMarker({ lat: loc.lat, lng: loc.lng });
        setAddress(
          res?.data?.result?.formattedAddress ||
            res?.data?.data?.formattedAddress ||
            search,
        );
      }
    } catch (error) {
      console.warn("Geocode search failed", error);
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleConfirm = async () => {
    if (!marker) return;
    if (hasZones && !selectedZone) return;
    if (hasZones && !isInsideZone) return;
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
      zone: selectedZone,
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
          <div className="relative rounded-xl overflow-hidden border border-slate-200 h-[340px]">
            <Map
              mapboxAccessToken={token}
              mapStyle={styleUrl}
              initialViewState={viewState}
              onClick={onMapClick}
              style={{ width: "100%", height: "100%" }}
              cursor="crosshair"
            >
              {hasZones && (
                <Source id="seller-zones" type="geojson" data={zoneData}>
                  <Layer
                    id="seller-zones-fill"
                    type="fill"
                    paint={{ "fill-color": "#4f46e5", "fill-opacity": 0.15 }}
                  />
                  <Layer
                    id="seller-zones-line"
                    type="line"
                    paint={{ "line-color": "#4f46e5", "line-width": 2 }}
                  />
                </Source>
              )}
              {marker && (
                <Marker
                  latitude={marker.lat}
                  longitude={marker.lng}
                  anchor="bottom"
                  draggable
                  onDragEnd={(e) => {
                    applyMarker({ lat: e.lngLat.lat, lng: e.lngLat.lng });
                    reverseGeocode(e.lngLat.lat, e.lngLat.lng);
                  }}
                >
                  <MapPin className="text-green-600 w-8 h-8 drop-shadow" />
                </Marker>
              )}
            </Map>
            <div className="absolute top-3 left-3 bg-white/95 text-[10px] font-black uppercase text-brand-600 px-2 py-1 rounded shadow">
              Click or drag pin
            </div>
          </div>

          {hasZones && marker && !isInsideZone && (
            <div className="mt-3 p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
              <div>
                <p className="font-bold text-sm">Store Outside Active Delivery Zones</p>
                <p className="text-xs text-rose-700 mt-1">
                  Move the pin inside a purple zone boundary before saving.
                </p>
              </div>
            </div>
          )}

          {hasZones && marker && isInsideZone && (
            <div className="mt-3 p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
              <div>
                <p className="font-bold text-sm">Location Validated</p>
                <p className="text-xs text-emerald-700 mt-1">
                  Your store is inside an active service zone.
                </p>
              </div>
            </div>
          )}

          {hasZones && (
            <div className="mt-3">
              <label className="block text-xs font-black uppercase text-slate-500 mb-1">
                Delivery Zone
              </label>
              <select
                value={selectedZone}
                onChange={(e) => setSelectedZone(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold"
                required
              >
                <option value="">Select a zone</option>
                {zones.map((z) => (
                  <option key={z._id} value={z._id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>
          )}

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
            <Button
              onClick={handleConfirm}
              disabled={!marker || isGeocoding || (hasZones && (!selectedZone || !isInsideZone))}
            >
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
