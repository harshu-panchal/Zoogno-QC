import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  GoogleMap,
  useJsApiLoader,
  Autocomplete,
  Marker,
  Polygon,
} from "@react-google-maps/api";
import { Search, MapPin, Navigation, Loader2, AlertTriangle, ShieldCheck, Globe } from "lucide-react";
import { toast } from "sonner";
import { sellerApi } from "../services/sellerApi";
import Card from "@shared/components/ui/Card";
import Button from "@shared/components/ui/Button";
import Input from "@shared/components/ui/Input";

const GOOGLE_MAPS_LIBRARIES = ["places", "geometry"];
const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 }; // India Center
const DEFAULT_ZOOM = 5;

const mapContainerStyle = {
  width: "100%",
  height: "400px",
  borderRadius: "12px",
};

const LocationManagement = () => {
  const [profile, setProfile] = useState(null);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isInsideZone, setIsInsideZone] = useState(true);

  // Form State
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [address, setAddress] = useState("");
  const [locality, setLocality] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [selectedZone, setSelectedZone] = useState("");
  const [radius, setRadius] = useState(5);
  
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
  const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM);
  const [addressInput, setAddressInput] = useState("");

  const mapRef = useRef(null);
  const autocompleteRef = useRef(null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const fetchData = async () => {
    try {
      // Fetch profile
      const profileRes = await sellerApi.getProfile();
      const pData = profileRes.data.result || profileRes.data.data;
      setProfile(pData);

      // Populate form state
      if (pData.location?.coordinates && pData.location.coordinates[0] !== 0) {
        const [lngVal, latVal] = pData.location.coordinates;
        setLat(latVal);
        setLng(lngVal);
        setMapCenter({ lat: latVal, lng: lngVal });
        setMapZoom(14);
      }
      setAddress(pData.address || "");
      setLocality(pData.locality || "");
      setCity(pData.city || "");
      setState(pData.state || "");
      setPincode(pData.pincode || "");
      setRadius(pData.serviceRadius || 5);
      if (pData.zone) {
        setSelectedZone(pData.zone._id || pData.zone);
      }

      // Fetch active zones
      const zonesRes = await sellerApi.getZones();
      setZones(zonesRes.data?.results || zonesRes.data?.data || []);
    } catch (error) {
      toast.error("Failed to load location details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Check if marker is inside any polygon
  const checkZoneContainment = useCallback((latitude, longitude, loadedZones) => {
    if (!window.google?.maps?.geometry?.poly || !latitude || !longitude) return true;
    
    const point = new window.google.maps.LatLng(latitude, longitude);
    let matched = false;

    for (const zone of loadedZones) {
      const ring = zone.location?.coordinates?.[0] || [];
      if (ring.length === 0) continue;

      const path = ring.map((c) => ({ lat: c[1], lng: c[0] }));
      const polygon = new window.google.maps.Polygon({ paths: path });
      
      if (window.google.maps.geometry.poly.containsLocation(point, polygon)) {
        matched = true;
        break;
      }
    }
    return matched;
  }, []);

  useEffect(() => {
    if (lat && lng && zones.length > 0) {
      const contained = checkZoneContainment(lat, lng, zones);
      setIsInsideZone(contained);
    }
  }, [lat, lng, zones, checkZoneContainment]);

  // Reverse geocoding helper
  const reverseGeocode = (latitude, longitude) => {
    if (!window.google?.maps) return;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
      if (status === "OK" && results[0]) {
        const components = results[0].address_components || [];
        setAddress(results[0].formatted_address || "");

        // Helper to get component long_name
        const getComponent = (types) => {
          const match = components.find((c) => types.some((t) => c.types.includes(t)));
          return match ? match.long_name : "";
        };

        setLocality(getComponent(["sublocality", "neighborhood", "locality"]) || "");
        setCity(getComponent(["locality", "administrative_area_level_2"]) || "");
        setState(getComponent(["administrative_area_level_1"]) || "");
        setPincode(getComponent(["postal_code"]) || "");
      }
    });
  };

  const handleMapClick = (e) => {
    const newLat = e.latLng.lat();
    const newLng = e.latLng.lng();
    setLat(newLat);
    setLng(newLng);
    reverseGeocode(newLat, newLng);
  };

  const handleMarkerDragEnd = (e) => {
    const newLat = e.latLng.lat();
    const newLng = e.latLng.lng();
    setLat(newLat);
    setLng(newLng);
    reverseGeocode(newLat, newLng);
  };

  const handleAutocompleteLoad = useCallback((autocompleteInstance) => {
    autocompleteRef.current = autocompleteInstance;
  }, []);

  const handlePlaceChanged = () => {
    if (autocompleteRef.current) {
      const place = autocompleteRef.current.getPlace();
      if (place.geometry && place.geometry.location) {
        const newLat = place.geometry.location.lat();
        const newLng = place.geometry.location.lng();
        setLat(newLat);
        setLng(newLng);
        setMapCenter({ lat: newLat, lng: newLng });
        setMapZoom(15);
        reverseGeocode(newLat, newLng);
      }
    }
  };

  const handleSaveLocation = async (e) => {
    e.preventDefault();
    if (!lat || !lng) {
      toast.error("Please place a pin on the map to define your store location");
      return;
    }
    if (!address.trim()) {
      toast.error("Address is required");
      return;
    }
    if (!selectedZone) {
      toast.error("Please select a delivery zone");
      return;
    }

    // Client-side zone containment check
    if (!isInsideZone) {
      toast.error("Your store location must be within an active delivery zone.");
      return;
    }

    setSaving(true);
    try {
      await sellerApi.updateProfile({
        lat,
        lng,
        address,
        locality,
        city,
        state,
        pincode,
        radius,
        zone: selectedZone,
      });
      toast.success("Store location updated successfully");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update location");
    } finally {
      setSaving(false);
    }
  };

  const handleMapLoad = useCallback((mapInstance) => {
    mapRef.current = mapInstance;
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 font-['Outfit']">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-black text-slate-800">Store Location Management</h1>
        <p className="text-sm text-slate-500 font-medium">
          Set up and pin your store location inside active delivery zones.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* Left Side: Map and Inputs */}
        <div className="space-y-6">
          <Card className="p-6 space-y-4">
            <h3 className="text-lg font-black text-slate-900">Pin Store Location</h3>
            
            {/* Search Box */}
            {isLoaded ? (
              <Autocomplete onLoad={handleAutocompleteLoad} onPlaceChanged={handlePlaceChanged}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    type="text"
                    className="pl-10"
                    placeholder="Search address or neighborhood to locate your store..."
                    value={addressInput}
                    onChange={(e) => setAddressInput(e.target.value)}
                  />
                </div>
              </Autocomplete>
            ) : (
              <div className="h-10 bg-slate-100 animate-pulse rounded border border-slate-200" />
            )}

            {/* Google Map */}
            {loadError && (
              <div className="p-4 bg-rose-50 border border-rose-100 rounded-lg text-rose-800 text-sm flex gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                Failed to load Google Maps. Please verify credentials.
              </div>
            )}

            {isLoaded ? (
              <div className="relative">
                <GoogleMap
                  mapContainerStyle={mapContainerStyle}
                  center={mapCenter}
                  zoom={mapZoom}
                  onLoad={handleMapLoad}
                  onClick={handleMapClick}
                >
                  {/* Render active zones as polygons */}
                  {zones.map((zone) => {
                    const ring = zone.location?.coordinates?.[0] || [];
                    if (ring.length === 0) return null;
                    const path = ring.map((c) => ({ lat: c[1], lng: c[0] }));
                    return (
                      <Polygon
                        key={zone._id}
                        paths={path}
                        options={{
                          fillColor: "#4f46e5",
                          fillOpacity: 0.15,
                          strokeWeight: 1.5,
                          strokeColor: "#4f46e5",
                          clickable: false,
                        }}
                      />
                    );
                  })}

                  {/* Seller Storefront Marker */}
                  {lat && lng && (
                    <Marker
                      position={{ lat, lng }}
                      draggable={true}
                      onDragEnd={handleMarkerDragEnd}
                      animation={window.google?.maps?.Animation?.DROP}
                    />
                  )}
                </GoogleMap>
                <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-lg text-[10px] font-black uppercase text-brand-600 shadow-sm border border-slate-200">
                  Click Map or Drag Pin to Reposition
                </div>
              </div>
            ) : (
              <div className="h-[400px] bg-slate-100 flex items-center justify-center rounded-xl border border-slate-200">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
              </div>
            )}

            {/* Zone Containment Warnings */}
            {!isInsideZone && lat && lng && (
              <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-start gap-3 shadow-xs">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 text-rose-600 mt-0.5" />
                <div>
                  <p className="font-bold text-sm">Store Outside Active Delivery Zones</p>
                  <p className="text-xs text-rose-700 mt-1 leading-relaxed">
                    Your current pin location falls outside our defined delivery zones (colored areas). You will not be able to save your location or receive orders until the pin is placed inside one of the active service zones.
                  </p>
                </div>
              </div>
            )}

            {isInsideZone && lat && lng && (
              <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl flex items-start gap-3 shadow-xs">
                <ShieldCheck className="w-5 h-5 flex-shrink-0 text-emerald-600 mt-0.5" />
                <div>
                  <p className="font-bold text-sm">Location Validated</p>
                  <p className="text-xs text-emerald-700 mt-1 leading-relaxed">
                    Your store location is successfully placed within an active service zone.
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Right Side: Form Inputs and Save */}
        <div className="space-y-6">
          <Card className="p-6">
            <form onSubmit={handleSaveLocation} className="space-y-4">
              <h3 className="text-lg font-black text-slate-900 border-b border-slate-50 pb-2 mb-2">Address Details</h3>

              <div className="space-y-1">
                <label className="text-xs font-black uppercase tracking-wider text-slate-500">Coordinates</label>
                <div className="grid grid-cols-2 gap-2 text-xs font-bold text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200/50">
                  <div>Lat: {lat ? lat.toFixed(6) : "Not set"}</div>
                  <div>Lng: {lng ? lng.toFixed(6) : "Not set"}</div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-500">Service Radius (km)</label>
                  <span className="text-[10px] font-bold text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full">Max 20 km</span>
                </div>
                <Input
                  type="number"
                  placeholder="e.g. 5"
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  min={1}
                  max={20}
                  required
                />
                <p className="text-[11px] font-semibold text-slate-400 mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Please choose a radius up to 20 km. Customers outside this range will not see your products.
                </p>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Delivery Zone</label>
                <select
                  value={selectedZone}
                  onChange={(e) => setSelectedZone(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-slate-300 transition-all"
                  required
                >
                  <option value="">Select a zone</option>
                  {zones.map((z) => (
                    <option key={z._id} value={z._id}>{z.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Full Store Address</label>
                <textarea
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-slate-300 transition-all min-h-[80px]"
                  placeholder="Street name, shop number, building..."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Locality / Area</label>
                <Input
                  type="text"
                  placeholder="e.g. Connaught Place"
                  value={locality}
                  onChange={(e) => setLocality(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">City</label>
                <Input
                  type="text"
                  placeholder="e.g. New Delhi"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">State</label>
                  <Input
                    type="text"
                    placeholder="Delhi"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Pincode</label>
                  <Input
                    type="text"
                    placeholder="110001"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value)}
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full flex justify-center items-center gap-2 mt-4"
                disabled={saving || !lat || !lng || !isInsideZone}
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Location
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default LocationManagement;
