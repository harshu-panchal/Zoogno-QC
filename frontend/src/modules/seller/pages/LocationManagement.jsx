import React, { useState, useEffect, useCallback } from "react";
import { Loader2, AlertTriangle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { sellerApi } from "../services/sellerApi";
import Card from "@shared/components/ui/Card";
import Button from "@shared/components/ui/Button";
import Input from "@shared/components/ui/Input";
import SellerLocationMap, {
  isPointInAnyZone,
} from "@shared/components/map/SellerLocationMap";

const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 };

const LocationManagement = () => {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isInsideZone, setIsInsideZone] = useState(true);

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
  const [mapZoom, setMapZoom] = useState(5);

  const fetchData = async () => {
    try {
      const profileRes = await sellerApi.getProfile();
      const pData = profileRes.data.result || profileRes.data.data;
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
      if (pData.zone) setSelectedZone(pData.zone._id || pData.zone);

      const zonesRes = await sellerApi.getZones();
      setZones(zonesRes.data?.results || zonesRes.data?.data || []);
    } catch {
      toast.error("Failed to load location details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (lat != null && lng != null && zones.length > 0) {
      setIsInsideZone(isPointInAnyZone(lat, lng, zones));
    }
  }, [lat, lng, zones]);

  const handleLocationChange = useCallback(({ lat: newLat, lng: newLng, address: addr }) => {
    setLat(newLat);
    setLng(newLng);
    setMapCenter({ lat: newLat, lng: newLng });
    setMapZoom(15);
    if (addr) setAddress(addr);
  }, []);

  const handleSaveLocation = async (e) => {
    e.preventDefault();
    if (lat == null || lng == null) {
      toast.error("Please place a pin on the map");
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

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 font-['Outfit']">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-black text-slate-800">Store Location Management</h1>
        <p className="text-sm text-slate-500 font-medium">
          Pin your store inside an active delivery zone (Mapbox).
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-6">
          <Card className="p-6 space-y-4">
            <h3 className="text-lg font-black text-slate-900">Pin Store Location</h3>

            <SellerLocationMap
              zones={zones}
              lat={lat}
              lng={lng}
              onLocationChange={handleLocationChange}
              center={mapCenter}
              zoom={mapZoom}
            />

            {!isInsideZone && lat != null && lng != null && (
              <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
                <div>
                  <p className="font-bold text-sm">Store Outside Active Delivery Zones</p>
                  <p className="text-xs text-rose-700 mt-1">
                    Move the pin inside a purple zone boundary before saving.
                  </p>
                </div>
              </div>
            )}

            {isInsideZone && lat != null && lng != null && (
              <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
                <div>
                  <p className="font-bold text-sm">Location Validated</p>
                  <p className="text-xs text-emerald-700 mt-1">
                    Your store is inside an active service zone.
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <form onSubmit={handleSaveLocation} className="space-y-4">
              <h3 className="text-lg font-black text-slate-900 border-b border-slate-50 pb-2 mb-2">
                Address Details
              </h3>

              <div className="grid grid-cols-2 gap-2 text-xs font-bold text-slate-700 bg-slate-50 p-2.5 rounded-lg border">
                <div>Lat: {lat != null ? lat.toFixed(6) : "Not set"}</div>
                <div>Lng: {lng != null ? lng.toFixed(6) : "Not set"}</div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-1">
                  Service Radius (km)
                </label>
                <Input
                  type="number"
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  min={1}
                  max={20}
                  required
                />
              </div>

              <div>
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

              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-1">
                  Full Store Address
                </label>
                <textarea
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm min-h-[80px]"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-1">
                  Locality
                </label>
                <Input value={locality} onChange={(e) => setLocality(e.target.value)} />
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-1">
                  City
                </label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-500 mb-1">
                    State
                  </label>
                  <Input value={state} onChange={(e) => setState(e.target.value)} required />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase text-slate-500 mb-1">
                    Pincode
                  </label>
                  <Input value={pincode} onChange={(e) => setPincode(e.target.value)} required />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full mt-4"
                disabled={saving || lat == null || lng == null || !isInsideZone}
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2 inline" />}
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
