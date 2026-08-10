import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  GoogleMap,
  useJsApiLoader,
  Autocomplete,
  Polygon,
} from "@react-google-maps/api";
import { Search, MapPin, Trash2, Plus, Edit, Globe, Eye, Map, AlertTriangle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "../services/adminApi";
import Card from "@shared/components/ui/Card";
import Button from "@shared/components/ui/Button";
import Input from "@shared/components/ui/Input";
import Modal from "@shared/components/ui/Modal";
import PageHeader from "@shared/components/ui/PageHeader";

const GOOGLE_MAPS_LIBRARIES = ["places"];
const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 }; // India Center
const DEFAULT_ZOOM = 5;

const mapContainerStyle = {
  width: "100%",
  height: "450px",
  borderRadius: "8px",
};

const ZoneManagement = () => {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedZone, setSelectedZone] = useState(null); // zone being created or edited
  const [zoneName, setZoneName] = useState("");
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [coordinates, setCoordinates] = useState([]); // array of [lng, lat]
  const [addressInput, setAddressInput] = useState("");

  const mapRef = useRef(null);
  const autocompleteRef = useRef(null);
  const drawingManagerRef = useRef(null);
  const drawnPolygonRef = useRef(null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const fetchZones = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getZones();
      const fetched = response.data?.results || response.data?.data || response.data?.result || response.data;
      setZones(Array.isArray(fetched) ? fetched : []);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch zones");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchZones();
  }, []);

  const handleOpenAddModal = () => {
    setSelectedZone(null);
    setZoneName("");
    setCoordinates([]);
    setAddressInput("");
    setCenter(DEFAULT_CENTER);
    setZoom(DEFAULT_ZOOM);
    setModalOpen(true);
    if (drawnPolygonRef.current) {
      drawnPolygonRef.current.setMap(null);
      drawnPolygonRef.current = null;
    }
  };

  const handleOpenEditModal = (zone) => {
    setSelectedZone(zone);
    setZoneName(zone.name);
    setAddressInput("");
    
    // Parse GeoJSON coordinates: [[[lng, lat], [lng, lat], ...]]
    const geoCoords = zone.location?.coordinates?.[0] || [];
    // Convert to [lng, lat] format we store in state
    setCoordinates(geoCoords);

    // Center map around first coordinate
    if (geoCoords.length > 0) {
      const firstCoord = geoCoords[0];
      setCenter({ lat: firstCoord[1], lng: firstCoord[0] });
      setZoom(13);
    }
    setModalOpen(true);
  };

  const handleDeleteZone = async (id) => {
    if (!window.confirm("Are you sure you want to delete this zone?")) return;
    try {
      await adminApi.deleteZone(id);
      toast.success("Zone deleted successfully");
      fetchZones();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to delete zone");
    }
  };

  // Maps / Autocomplete load callbacks
  const handleMapLoad = useCallback((mapInstance) => {
    mapRef.current = mapInstance;
  }, []);

  const handleAutocompleteLoad = useCallback((autocompleteInstance) => {
    autocompleteRef.current = autocompleteInstance;
  }, []);

  const handlePlaceChanged = () => {
    if (autocompleteRef.current) {
      const place = autocompleteRef.current.getPlace();
      if (place.geometry && place.geometry.location) {
        const newPos = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        };
        setCenter(newPos);
        setZoom(14);
      }
    }
  };

  const handleMapClick = useCallback((e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    setCoordinates((prev) => [...prev, [lng, lat]]);
  }, []);

  const handlePolygonPathChange = useCallback(() => {
    if (drawnPolygonRef.current) {
      const path = drawnPolygonRef.current.getPath();
      const coords = [];
      for (let i = 0; i < path.getLength(); i++) {
        const latLng = path.getAt(i);
        coords.push([latLng.lng(), latLng.lat()]);
      }
      setCoordinates(coords);
    }
  }, []);

  const handlePolygonLoad = useCallback((polygon) => {
    drawnPolygonRef.current = polygon;
    const path = polygon.getPath();
    
    const listeners = [
      path.addListener("set_at", handlePolygonPathChange),
      path.addListener("insert_at", handlePolygonPathChange),
      path.addListener("remove_at", handlePolygonPathChange)
    ];

    return () => {
      listeners.forEach(l => window.google.maps.event.removeListener(l));
    };
  }, [handlePolygonPathChange]);

  const handleUndo = () => {
    setCoordinates((prev) => prev.slice(0, -1));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!zoneName.trim()) {
      toast.error("Please enter a zone name");
      return;
    }
    if (coordinates.length < 3) {
      toast.error("Please draw a zone on the map with at least 3 points");
      return;
    }

    try {
      const payload = {
        name: zoneName,
        coordinates,
      };

      if (selectedZone) {
        await adminApi.updateZone(selectedZone._id, payload);
        toast.success("Zone updated successfully");
      } else {
        await adminApi.createZone(payload);
        toast.success("Zone created successfully");
      }
      
      setModalOpen(false);
      fetchZones();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to save zone");
    }
  };

  const handleClearDrawings = () => {
    if (drawnPolygonRef.current) {
      drawnPolygonRef.current.setMap(null);
      drawnPolygonRef.current = null;
    }
    setCoordinates([]);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <PageHeader title="Zone Management" subtitle="Create and manage your delivery zones using interactive maps." />
        <Button onClick={handleOpenAddModal} className="flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Delivery Zone
        </Button>
      </div>

      {loading && zones.length === 0 ? (
        <div className="flex justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
        </div>
      ) : zones.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <Globe className="w-16 h-16 text-slate-300 mb-4 animate-pulse" />
          <h3 className="text-lg font-bold text-slate-800">No Zones Configured</h3>
          <p className="text-slate-500 mt-2 max-w-md">
            Create custom geographic zones to define where your sellers can service orders instead of relying on a simple radius.
          </p>
          <Button onClick={handleOpenAddModal} className="mt-6 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create First Zone
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          <Card className="p-0 overflow-hidden border border-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Zone Name</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Points</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Created At</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {zones.map((zone) => {
                    const pointsCount = zone.location?.coordinates?.[0]?.length || 0;
                    return (
                      <tr key={zone._id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-6 py-4 text-sm font-bold text-slate-800">{zone.name}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{pointsCount} coordinates</td>
                        <td className="px-6 py-4 text-sm">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${zone.isActive ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                            {zone.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">
                          {new Date(zone.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-sm text-right space-x-2">
                          <Button variant="outline" size="sm" onClick={() => handleOpenEditModal(zone)} className="inline-flex items-center gap-1.5">
                            <Edit className="w-3.5 h-3.5" /> Edit
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => handleDeleteZone(zone._id)} className="inline-flex items-center gap-1.5">
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Modal for Create/Edit */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={selectedZone ? "Edit Delivery Zone" : "Create Delivery Zone"} size="xl">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Zone Name</label>
            <Input
              type="text"
              placeholder="e.g. South Delhi Hub, Mumbai Downtown"
              value={zoneName}
              onChange={(e) => setZoneName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Search & Center Map</label>
            {isLoaded ? (
              <div className="relative">
                <Autocomplete onLoad={handleAutocompleteLoad} onPlaceChanged={handlePlaceChanged}>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      type="text"
                      className="pl-10"
                      placeholder="Search location to center map..."
                      value={addressInput}
                      onChange={(e) => setAddressInput(e.target.value)}
                    />
                  </div>
                </Autocomplete>
              </div>
            ) : (
              <div className="h-10 bg-slate-100 animate-pulse rounded border border-slate-200" />
            )}
          </div>

          <div className="relative">
            <label className="block text-sm font-bold text-slate-700 mb-1">Draw Area boundary</label>
            <p className="text-xs text-slate-500 mb-2">
              Click anywhere on the map to place zone vertices. You can drag existing points to refine boundaries, or use Undo/Clear below.
            </p>

            {loadError && (
              <div className="flex items-center gap-2 p-4 text-rose-800 bg-rose-50 rounded-lg border border-rose-100">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm">Failed to load Google Maps. Please check your API configuration.</span>
              </div>
            )}

            {isLoaded ? (
              <div className="border border-slate-200 rounded-lg overflow-hidden relative">
                <GoogleMap
                  mapContainerStyle={mapContainerStyle}
                  center={center}
                  zoom={zoom}
                  onLoad={handleMapLoad}
                  onClick={handleMapClick}
                >
                  {coordinates.length > 0 && (
                    <Polygon
                      paths={coordinates.map((c) => ({ lat: c[1], lng: c[0] }))}
                      options={{
                        fillColor: "#4f46e5",
                        fillOpacity: 0.35,
                        strokeWeight: 2,
                        strokeColor: "#4f46e5",
                        editable: true,
                        draggable: true,
                      }}
                      onLoad={handlePolygonLoad}
                    />
                  )}
                </GoogleMap>

                {coordinates.length > 0 && (
                  <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm shadow-md px-3 py-1.5 rounded-full text-xs font-bold text-slate-700 border border-slate-200/50 flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-brand-500" />
                    <span>{coordinates.length} points</span>
                    <button type="button" onClick={handleUndo} className="text-slate-600 hover:text-slate-800 ml-1 underline flex items-center gap-0.5">
                      <RotateCcw className="w-3.5 h-3.5" /> Undo
                    </button>
                    <button type="button" onClick={handleClearDrawings} className="text-rose-600 hover:text-rose-700 ml-1 underline">
                      Clear
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-[450px] bg-slate-100 flex items-center justify-center rounded-lg border border-slate-200">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              {selectedZone ? "Update Zone" : "Create Zone"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ZoneManagement;
