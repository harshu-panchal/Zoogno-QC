import React, { useState, useEffect } from "react";
import { Trash2, Plus, Edit, Globe } from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "../services/adminApi";
import Card from "@shared/components/ui/Card";
import Button from "@shared/components/ui/Button";
import Input from "@shared/components/ui/Input";
import Modal from "@shared/components/ui/Modal";
import PageHeader from "@shared/components/ui/PageHeader";
import ZoneDrawMap from "@shared/components/map/ZoneDrawMap";

const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 };

const ZoneManagement = () => {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedZone, setSelectedZone] = useState(null);
  const [zoneName, setZoneName] = useState("");
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [zoom, setZoom] = useState(5);
  const [coordinates, setCoordinates] = useState([]);
  const [mapKey, setMapKey] = useState("new");

  const fetchZones = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getZones();
      const fetched =
        response.data?.results ||
        response.data?.data ||
        response.data?.result ||
        response.data;
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
    setCenter(DEFAULT_CENTER);
    setZoom(DEFAULT_ZOOM);
    setMapKey(`new-${Date.now()}`);
    setModalOpen(true);
  };

  const handleOpenEditModal = (zone) => {
    setSelectedZone(zone);
    setZoneName(zone.name);
    const geoCoords = zone.location?.coordinates?.[0] || [];
    setCoordinates(geoCoords);
    if (geoCoords.length > 0) {
      setCenter({ lat: geoCoords[0][1], lng: geoCoords[0][0] });
      setZoom(13);
    }
    setMapKey(zone._id || `edit-${Date.now()}`);
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
      const payload = { name: zoneName, coordinates };
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <PageHeader
          title="Zone Management"
          subtitle="Create and manage delivery zones on Mapbox."
        />
        <Button onClick={handleOpenAddModal} className="flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Delivery Zone
        </Button>
      </div>

      {loading && zones.length === 0 ? (
        <div className="flex justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
        </div>
      ) : zones.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <Globe className="w-16 h-16 text-slate-300 mb-4 animate-pulse" />
          <h3 className="text-lg font-bold text-slate-800">No Zones Configured</h3>
          <p className="text-slate-500 mt-2 max-w-md">
            Draw geographic zones to define where sellers and delivery partners operate.
          </p>
          <Button onClick={handleOpenAddModal} className="mt-6 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create First Zone
          </Button>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden border border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Zone Name</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Points</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Created At</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {zones.map((zone) => {
                  const pointsCount = zone.location?.coordinates?.[0]?.length || 0;
                  return (
                    <tr key={zone._id} className="hover:bg-slate-50/80">
                      <td className="px-6 py-4 text-sm font-bold text-slate-800">{zone.name}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{pointsCount} coordinates</td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            zone.isActive
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {zone.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {new Date(zone.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-right space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEditModal(zone)}
                          className="inline-flex items-center gap-1.5"
                        >
                          <Edit className="w-3.5 h-3.5" /> Edit
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDeleteZone(zone._id)}
                          className="inline-flex items-center gap-1.5"
                        >
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
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={selectedZone ? "Edit Delivery Zone" : "Create Delivery Zone"}
        size="xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Zone Name</label>
            <Input
              type="text"
              placeholder="e.g. South Delhi Hub, Indore Central"
              value={zoneName}
              onChange={(e) => setZoneName(e.target.value)}
              required
            />
          </div>

          <ZoneDrawMap
            mapKey={mapKey}
            coordinates={coordinates}
            onCoordinatesChange={setCoordinates}
            center={center}
            zoom={zoom}
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">{selectedZone ? "Update Zone" : "Create Zone"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ZoneManagement;
