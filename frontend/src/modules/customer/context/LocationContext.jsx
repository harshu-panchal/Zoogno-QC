import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { customerApi } from "../services/customerApi";
import { hasValidStoredAuthToken } from "@core/utils/authStorage";

const LocationContext = createContext(undefined);
// v2 key to force one-time refresh from Google Maps for users
// who previously only had the default/static location cached.
const STORAGE_KEY = "location_v2";

export const LocationProvider = ({ children }) => {
  // Default location (used until we can resolve a better one)
  const [currentLocation, setCurrentLocation] = useState({
    name: "Locating...",
    time: "--",
    city: "",
    state: "",
    pincode: "",
    latitude: 0,
    longitude: 0,
  });

  // Address list for drawer UI – will be hydrated from profile API.
  const [savedAddresses, setSavedAddresses] = useState([]);

  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const [locationError, setLocationError] = useState(null);

  // Update the current location.
  // By default this does NOT change saved addresses; only explicit
  // address actions should touch the saved list.
  const updateLocation = (
    newLoc,
    { persist = true, updateSavedHome = false } = {},
  ) => {
    setCurrentLocation(newLoc);

    if (updateSavedHome) {
      setSavedAddresses((prev) =>
        prev.map((addr) =>
          addr.label === "Home" ? { ...addr, address: newLoc.name } : addr,
        ),
      );
    }

    if (persist && typeof window !== "undefined") {
      try {
        const payload = {
          address: newLoc.name,
          city: newLoc.city,
          state: newLoc.state,
          pincode: newLoc.pincode,
          latitude: newLoc.latitude,
          longitude: newLoc.longitude,
          // Internal app properties
          time: newLoc.time,
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // ignore storage errors
      }
    }
  };

  const addAddress = (newAddress) => {
    setSavedAddresses((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        label: newAddress.label || "Other",
        address: newAddress.address,
        phone: newAddress.phone || "N/A",
        isCurrent: false,
      },
    ]);
  };

  // Resolve location once using browser geolocation + Google Maps Geocoding.
  // Must be called directly from a user gesture (click/tap) for the browser to show the permission prompt.
  const fetchAndCacheLocation = () =>
    new Promise((resolve) => {
      if (
        typeof window === "undefined" ||
        !("navigator" in window) ||
        !navigator.geolocation
      ) {
        resolve({
          ok: false,
          error: "Geolocation is not supported on this device",
        });
        return;
      }

      setIsFetchingLocation(true);
      setLocationError(null);

      const fallbackFromCoords = (latitude, longitude) => ({
        name: `Lat ${Number(latitude).toFixed(5)}, Lng ${Number(longitude).toFixed(5)}`,
        time: "12-15 mins",
        city: currentLocation?.city || "Indore",
        state: currentLocation?.state || "Madhya Pradesh",
        pincode: currentLocation?.pincode || "452018",
        latitude,
        longitude,
      });

      const handleLocationSuccess = async (latitude, longitude) => {
        try {
          // Always succeed with coordinates (needed for delivery fee calculation),
          // even if reverse geocoding fails (key missing / quota / restrictions).
          let liveLocation = fallbackFromCoords(latitude, longitude);
          let geocodeSuccess = false;

          try {
            const response = await customerApi.reverseGeocode(latitude, longitude);
            const result = response.data?.result;
            if (result?.formattedAddress) {
              liveLocation = {
                name: result.formattedAddress,
                time: "12-15 mins",
                city: liveLocation.city,
                state: liveLocation.state,
                pincode: liveLocation.pincode,
                latitude,
                longitude,
              };
              geocodeSuccess = true;
            } else {
              throw new Error("No formatted address");
            }
          } catch (mapboxErr) {
            console.warn("Mapbox reverse geocoding failed:", mapboxErr.message);
          }

          if (!geocodeSuccess) {
            // Fallback to OSM Nominatim
            try {
              const osmResponse = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`);
              if (!osmResponse.ok) throw new Error("OSM HTTP Error");
              
              const osmData = await osmResponse.json();
              if (osmData && osmData.display_name) {
                const address = osmData.address || {};
                
                // Construct a friendly name
                const displayParts = [];
                if (address.road || address.pedestrian) displayParts.push(address.road || address.pedestrian);
                if (address.neighbourhood || address.suburb) displayParts.push(address.neighbourhood || address.suburb);
                if (address.city || address.town || address.village) displayParts.push(address.city || address.town || address.village);
                if (address.state) displayParts.push(`${address.state} ${address.postcode || ''}`.trim());
                if (address.country) displayParts.push(address.country);

                const friendlyName = displayParts.join(", ") || osmData.display_name;

                liveLocation = {
                  name: friendlyName,
                  time: "12-15 mins",
                  city: address.city || address.town || address.village || liveLocation.city,
                  state: address.state || liveLocation.state,
                  pincode: address.postcode || liveLocation.pincode,
                  latitude: latitude,
                  longitude: longitude,
                };
              } else {
                throw new Error("No OSM address data");
              }
            } catch (osmErr) {
              console.warn("OSM geocoding failed:", osmErr.message);
              throw new Error("All geocoding services failed");
            }
          }

          updateLocation(liveLocation, {
            persist: true,
            updateSavedHome: false,
          });
          resolve({ ok: true, location: liveLocation });
        } catch (err) {
          const loc = fallbackFromCoords(latitude, longitude);
          updateLocation(loc, { persist: true, updateSavedHome: false });
          resolve({
            ok: true,
            location: loc,
            warning: err?.message || "Unable to fetch address",
          });
        } finally {
          setIsFetchingLocation(false);
        }
      };

      const handleLocationError = (error) => {
        const message = typeof error === 'string' ? error : (error.message || "Location permission denied");
        setLocationError(message);
        setIsFetchingLocation(false);
        resolve({ ok: false, error: message });
      };

      // Native Flutter Bridge
      if (window.Flutter) {
        import("../../../lib/appZetoBridge").then(async (m) => {
          const AppZetoBridge = m.default;
          const coords = await AppZetoBridge.getLocation();
          if (coords && coords.lat && coords.lng) {
            handleLocationSuccess(coords.lat, coords.lng);
          } else {
            handleLocationError("Native location failed");
          }
        }).catch(() => handleLocationError("Bridge not found"));
        return;
      }

      // Standard Browser Geolocation
      navigator.geolocation.getCurrentPosition(
        (position) => handleLocationSuccess(position.coords.latitude, position.coords.longitude),
        handleLocationError,
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
        },
      );
    });

  const refreshAddresses = useCallback(async () => {
    // Skip if user is not logged in – getProfile would 401 and trigger axios reload loop
    if (!hasValidStoredAuthToken("auth_customer")) return;
    try {
      const { data } = await customerApi.getProfile();
      const profile = data?.result ?? data?.data ?? data;
      const raw = Array.isArray(profile?.addresses) ? profile.addresses : [];
      setSavedAddresses(
        raw.map((addr, idx) => ({
          id: addr._id ?? String(idx),
          label:
            (addr.label || "Home").charAt(0).toUpperCase() +
            (addr.label || "home").slice(1),
          address:
            addr.fullAddress ||
            [addr.landmark, addr.city, addr.state, addr.pincode]
              .filter(Boolean)
              .join(", ") ||
            "",
          location:
            addr?.location &&
            typeof addr.location.lat === "number" &&
            typeof addr.location.lng === "number" &&
            Number.isFinite(addr.location.lat) &&
            Number.isFinite(addr.location.lng)
              ? { lat: addr.location.lat, lng: addr.location.lng }
              : null,
          placeId: typeof addr?.placeId === "string" ? addr.placeId : null,
          phone: profile?.phone ?? "",
          isCurrent: idx === 0,
        })),
      );
    } catch {
      // If API fails, keep existing in-memory addresses.
    }
  }, []);

  // On mount: hydrate saved addresses from profile (only when customer is logged in)
  useEffect(() => {
    refreshAddresses();
  }, [refreshAddresses]);

  // On mount: try to restore from cache. If none found, attempt to auto-fetch
  // live location (may prompt for permission depending on browser/app state).
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const addressName = parsed.address || parsed.name;
        if (parsed && addressName) {
          updateLocation(
            {
              name: addressName,
              time: parsed.time || "12-15 mins",
              city: parsed.city,
              state: parsed.state,
              pincode: parsed.pincode,
              latitude: parsed.latitude,
              longitude: parsed.longitude,
            },
            { persist: false, updateSavedHome: false },
          );
        }
      } else {
        // Automatically attempt to fetch live location instead of keeping dummy
        fetchAndCacheLocation().then((res) => {
          if (!res.ok) {
            // Update to a generic prompt if permission denied or failed
            updateLocation({
              name: "Please select your location",
              time: "--",
              city: "",
              state: "",
              pincode: "",
              latitude: 0,
              longitude: 0,
            }, { persist: false, updateSavedHome: false });
          }
        });
      }
    } catch {
      // ignore parse errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Zone service switch (admin can turn a zone off) ---
  const [zoneService, setZoneService] = useState({
    serviceable: true,
    zoneName: null,
  });
  const [zoneOffModalOpen, setZoneOffModalOpen] = useState(false);
  const lastOffZoneRef = useRef(null);
  const lat = Number(currentLocation?.latitude);
  const lng = Number(currentLocation?.longitude);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);

  const checkZoneService = useCallback(async () => {
    if (!hasCoords) return;
    try {
      const { data } = await customerApi.getZoneServiceStatus(lat, lng);
      const res = data?.result ?? data?.data ?? data;
      const serviceable = res?.serviceable !== false;
      setZoneService({ serviceable, zoneName: res?.zoneName || null });
      if (!serviceable) {
        // Pop up once each time the customer lands in (or returns to) an off zone.
        if (lastOffZoneRef.current !== (res?.zoneId || "off")) {
          lastOffZoneRef.current = res?.zoneId || "off";
          setZoneOffModalOpen(true);
        }
      } else {
        lastOffZoneRef.current = null;
      }
    } catch {
      // Network failure: keep last known state; backend still enforces on order.
    }
  }, [hasCoords, lat, lng]);

  useEffect(() => {
    checkZoneService();
    if (!hasCoords) return undefined;
    const timer = setInterval(checkZoneService, 60000);
    const onVisible = () => {
      if (document.visibilityState === "visible") checkZoneService();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [checkZoneService, hasCoords]);

  const locationValue = useMemo(() => ({
    isServiceOff: zoneService.serviceable === false,
    zoneName: zoneService.zoneName,
    openZoneOffModal: () => setZoneOffModalOpen(true),
    currentLocation,
    savedAddresses,
    updateLocation,
    addAddress,
    refreshAddresses,
    isFetchingLocation,
    locationError,
    refreshLocation: fetchAndCacheLocation,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [currentLocation, savedAddresses, isFetchingLocation, locationError, refreshAddresses, zoneService]);

  return (
    <LocationContext.Provider value={locationValue}>
      {children}
      {zoneOffModalOpen && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 px-6"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-2xl">
              🚫
            </div>
            <h3 className="text-lg font-black text-slate-900">Service is currently off</h3>
            <p className="mt-2 text-sm font-medium text-slate-500">
              Service is currently off for {zoneService.zoneName ? `"${zoneService.zoneName}"` : "your"} zone.
              You can browse products, but orders can't be placed right now.
            </p>
            <button
              type="button"
              onClick={() => setZoneOffModalOpen(false)}
              className="mt-5 w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white active:scale-95"
            >
              OK, got it
            </button>
          </div>
        </div>
      )}
    </LocationContext.Provider>
  );
};

export const useLocation = () => {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error("useLocation must be used within a LocationProvider");
  }
  return context;
};
