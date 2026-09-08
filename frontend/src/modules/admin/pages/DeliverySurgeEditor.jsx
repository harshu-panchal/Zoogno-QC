import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Check, ChevronsUpDown, MapPin, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminDeliverySurgeApi } from "../services/api/deliverySurgeApi";
import { adminZonesApi } from "../services/api/zonesApi";

const emptyForm = {
  name: "",
  description: "",
  amount: "20",
  zoneIds: [],
  status: "draft",
  startAt: "",
  endAt: "",
  priority: "0",
  useTimeWindow: false,
  windowStart: "22:00",
  windowEnd: "06:00",
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
};

const DAY_LABELS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

function toIstDateInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

function normalizeZoneList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

const DeliverySurgeEditor = () => {
  const { id } = useParams();
  const isEdit = Boolean(id) && id !== "new";
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [zones, setZones] = useState([]);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [zoneMenuOpen, setZoneMenuOpen] = useState(false);
  const [zoneSearch, setZoneSearch] = useState("");
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const toggleZone = (zoneId) => {
    setForm((prev) => {
      const set = new Set(prev.zoneIds);
      if (set.has(zoneId)) set.delete(zoneId);
      else set.add(zoneId);
      return { ...prev, zoneIds: [...set] };
    });
  };

  const selectAllZones = () => {
    setForm((prev) => ({
      ...prev,
      zoneIds: zones.map((z) => String(z._id)),
    }));
  };

  const clearZones = () => setField("zoneIds", []);

  const toggleDay = (day) => {
    setForm((prev) => {
      const set = new Set(prev.daysOfWeek);
      if (set.has(day)) set.delete(day);
      else set.add(day);
      return { ...prev, daysOfWeek: [...set].sort() };
    });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setZonesLoading(true);
        let list = [];
        try {
          const res = await adminDeliverySurgeApi.zones();
          list = normalizeZoneList(res.data.result ?? res.data.results);
        } catch {
          list = [];
        }
        if (!list.length) {
          const fallback = await adminZonesApi.getZones();
          list = normalizeZoneList(fallback.data.result ?? fallback.data.results);
        }
        if (!cancelled) setZones(list);
      } catch {
        if (!cancelled) {
          setZones([]);
          toast.error("Failed to load zones");
        }
      } finally {
        if (!cancelled) setZonesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        setLoading(true);
        const res = await adminDeliverySurgeApi.get(id);
        const rule = res.data.result;
        const tw = rule.timeWindows?.[0];
        setForm({
          name: rule.name || "",
          description: rule.description || "",
          amount: String(rule.amount ?? ""),
          zoneIds: (rule.zoneIds || []).map((z) => String(z._id || z)),
          status: rule.status || "draft",
          startAt: toIstDateInput(rule.startAt),
          endAt: toIstDateInput(rule.endAt),
          priority: String(rule.priority ?? 0),
          useTimeWindow: Boolean(tw),
          windowStart: tw?.startTime || "22:00",
          windowEnd: tw?.endTime || "06:00",
          daysOfWeek: tw?.daysOfWeek?.length ? tw.daysOfWeek : [0, 1, 2, 3, 4, 5, 6],
        });
      } catch (error) {
        toast.error(error?.response?.data?.message || "Failed to load surge");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isEdit]);

  const zoneById = useMemo(() => {
    const map = new Map();
    zones.forEach((z) => map.set(String(z._id), z));
    return map;
  }, [zones]);

  const selectedZones = form.zoneIds
    .map((zid) => zoneById.get(zid))
    .filter(Boolean);

  const filteredZones = useMemo(() => {
    const q = zoneSearch.trim().toLowerCase();
    if (!q) return zones;
    return zones.filter((z) => String(z.name || "").toLowerCase().includes(q));
  }, [zones, zoneSearch]);

  const buildPayload = () => ({
    name: form.name.trim(),
    description: form.description.trim(),
    amount: Number(form.amount),
    zoneIds: form.zoneIds,
    status: form.status,
    priority: Number(form.priority) || 0,
    startAt: form.startAt || null,
    endAt: form.endAt || null,
    timeWindows: form.useTimeWindow
      ? [
          {
            daysOfWeek: form.daysOfWeek,
            startTime: form.windowStart,
            endTime: form.windowEnd,
          },
        ]
      : [],
  });

  const handleSave = async (activate = false) => {
    if (!form.name.trim() || !Number(form.amount) || !form.zoneIds.length) {
      return toast.error("Name, amount, and at least one zone are required");
    }
    try {
      setSaving(true);
      const payload = buildPayload();
      if (activate) payload.status = "active";

      if (isEdit) {
        await adminDeliverySurgeApi.update(id, payload);
        if (activate && form.status !== "active") {
          await adminDeliverySurgeApi.setStatus(id, "active");
        }
        toast.success("Surge updated");
        navigate(`/admin/delivery-surges/${id}`);
      } else {
        const res = await adminDeliverySurgeApi.create(payload);
        const created = res.data.result;
        toast.success(activate ? "Surge activated" : "Surge created as draft");
        navigate(`/admin/delivery-surges/${created._id}`);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save surge");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-slate-400 animate-pulse">Loading...</div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <button
          onClick={() => navigate("/admin/delivery-surges")}
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            {isEdit ? "Edit Delivery Surge" : "New Delivery Surge"}
          </h1>
          <p className="text-sm text-slate-500">
            Fixed ₹ amount credited to riders when delivering inside selected zones.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Name</label>
          <input
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            placeholder="e.g. Rain, Night Delivery"
            className="mt-1 w-full px-4 py-2.5 bg-slate-50 rounded-xl text-sm outline-none"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setField("description", e.target.value)}
            rows={2}
            className="mt-1 w-full px-4 py-2.5 bg-slate-50 rounded-xl text-sm outline-none resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Surge amount (₹)
            </label>
            <input
              type="number"
              min="1"
              value={form.amount}
              onChange={(e) => setField("amount", e.target.value)}
              className="mt-1 w-full px-4 py-2.5 bg-slate-50 rounded-xl text-sm outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Priority</label>
            <input
              type="number"
              min="0"
              value={form.priority}
              onChange={(e) => setField("priority", e.target.value)}
              className="mt-1 w-full px-4 py-2.5 bg-slate-50 rounded-xl text-sm outline-none"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Zones <span className="text-rose-500">*</span>
            </label>
            {zones.length > 0 ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllZones}
                  className="text-[11px] font-bold text-primary hover:underline"
                >
                  Select all
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={clearZones}
                  className="text-[11px] font-bold text-slate-500 hover:underline"
                >
                  Clear
                </button>
              </div>
            ) : null}
          </div>

          {selectedZones.length > 0 ? (
            <div className="flex flex-wrap gap-2 mb-2">
              {selectedZones.map((z) => (
                <span
                  key={z._id}
                  className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-bold"
                >
                  <MapPin className="h-3 w-3" />
                  {z.name}
                  {!z.isActive ? (
                    <span className="text-[10px] text-amber-600 font-bold">inactive</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => toggleZone(String(z._id))}
                    className="p-0.5 rounded hover:bg-primary/20"
                    aria-label={`Remove ${z.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <div className="relative">
            <button
              type="button"
              onClick={() => setZoneMenuOpen((o) => !o)}
              className="w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 rounded-xl text-sm outline-none border border-transparent focus:border-primary/30"
            >
              <span
                className={cn(
                  "truncate",
                  form.zoneIds.length ? "text-slate-900 font-medium" : "text-slate-400",
                )}
              >
                {zonesLoading
                  ? "Loading zones..."
                  : form.zoneIds.length
                    ? `${form.zoneIds.length} zone${form.zoneIds.length > 1 ? "s" : ""} selected`
                    : "Select zones..."}
              </span>
              <ChevronsUpDown className="h-4 w-4 text-slate-400 shrink-0" />
            </button>

            {zoneMenuOpen ? (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10 cursor-default"
                  aria-label="Close zone menu"
                  onClick={() => setZoneMenuOpen(false)}
                />
                <div className="absolute z-20 mt-2 w-full rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
                  <div className="p-2 border-b border-slate-100">
                    <input
                      value={zoneSearch}
                      onChange={(e) => setZoneSearch(e.target.value)}
                      placeholder="Search zones..."
                      className="w-full px-3 py-2 bg-slate-50 rounded-lg text-sm outline-none"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    {filteredZones.length === 0 ? (
                      <p className="p-4 text-sm text-slate-400 text-center">
                        {zones.length === 0
                          ? "No zones found. Create zones under Zone Setup first."
                          : "No zones match your search."}
                      </p>
                    ) : (
                      filteredZones.map((z) => {
                        const selected = form.zoneIds.includes(String(z._id));
                        return (
                          <button
                            key={z._id}
                            type="button"
                            onClick={() => toggleZone(String(z._id))}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-slate-50",
                              selected && "bg-primary/5",
                            )}
                          >
                            <span
                              className={cn(
                                "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                                selected
                                  ? "bg-primary border-primary text-white"
                                  : "border-slate-300 bg-white",
                              )}
                            >
                              {selected ? <Check className="h-3 w-3" /> : null}
                            </span>
                            <span className="flex-1 font-medium text-slate-800">{z.name}</span>
                            {!z.isActive ? (
                              <span className="text-[10px] font-bold uppercase tracking-wide text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                                Inactive
                              </span>
                            ) : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Start date (optional)
            </label>
            <input
              type="date"
              value={form.startAt}
              onChange={(e) => setField("startAt", e.target.value)}
              className="mt-1 w-full px-4 py-2.5 bg-slate-50 rounded-xl text-sm outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              End date (optional)
            </label>
            <input
              type="date"
              value={form.endAt}
              onChange={(e) => setField("endAt", e.target.value)}
              className="mt-1 w-full px-4 py-2.5 bg-slate-50 rounded-xl text-sm outline-none"
            />
          </div>
        </div>

        <div className="border border-slate-100 rounded-xl p-4 space-y-3">
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <input
              type="checkbox"
              checked={form.useTimeWindow}
              onChange={(e) => setField("useTimeWindow", e.target.checked)}
            />
            Limit to time window (Asia/Kolkata)
          </label>
          {form.useTimeWindow ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500">Start time</label>
                  <input
                    type="time"
                    value={form.windowStart}
                    onChange={(e) => setField("windowStart", e.target.value)}
                    className="mt-1 w-full px-4 py-2.5 bg-slate-50 rounded-xl text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500">End time</label>
                  <input
                    type="time"
                    value={form.windowEnd}
                    onChange={(e) => setField("windowEnd", e.target.value)}
                    className="mt-1 w-full px-4 py-2.5 bg-slate-50 rounded-xl text-sm outline-none"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {DAY_LABELS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[11px] font-bold",
                      form.daysOfWeek.includes(d.value)
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-500",
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            disabled={saving}
            onClick={() => handleSave(false)}
            className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold disabled:opacity-50"
          >
            {saving ? "Saving..." : isEdit ? "Save changes" : "Save as draft"}
          </button>
          <button
            disabled={saving}
            onClick={() => handleSave(true)}
            className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50"
          >
            Save & Activate
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeliverySurgeEditor;
