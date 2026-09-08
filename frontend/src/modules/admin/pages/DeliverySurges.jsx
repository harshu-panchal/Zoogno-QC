import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Zap, Search, Pause, Play, Ban, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminDeliverySurgeApi } from "../services/api/deliverySurgeApi";
import { adminZonesApi } from "../services/api/zonesApi";

const STATUS_STYLES = {
  draft: "bg-slate-100 text-slate-700",
  active: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-800",
  ended: "bg-slate-200 text-slate-600",
};

const DeliverySurges = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [zones, setZones] = useState([]);
  const [status, setStatus] = useState("all");
  const [zoneId, setZoneId] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchList = async () => {
    try {
      setLoading(true);
      const res = await adminDeliverySurgeApi.list({
        status: status === "all" ? undefined : status,
        zoneId: zoneId === "all" ? undefined : zoneId,
        search: search.trim() || undefined,
        limit: 100,
      });
      const payload = res.data.result || {};
      setItems(payload.items || []);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load delivery surges");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    adminDeliverySurgeApi
      .zones()
      .then((res) => {
        const payload = res.data.result ?? res.data.results;
        const list = Array.isArray(payload) ? payload : payload?.items || [];
        setZones(list);
      })
      .catch(async () => {
        try {
          const fallback = await adminZonesApi.getZones();
          const payload = fallback.data.result ?? fallback.data.results;
          setZones(Array.isArray(payload) ? payload : []);
        } catch {
          setZones([]);
        }
      });
  }, []);

  useEffect(() => {
    fetchList();
  }, [status, zoneId]);

  const changeStatus = async (id, next) => {
    try {
      await adminDeliverySurgeApi.setStatus(id, next);
      toast.success(`Surge ${next}`);
      fetchList();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update status");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this surge rule? If it was already applied, it will be ended instead.")) {
      return;
    }
    try {
      const res = await adminDeliverySurgeApi.remove(id);
      toast.success(res.data?.message || "Removed");
      fetchList();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to delete");
    }
  };

  const filtered = items.filter((row) => {
    if (!search.trim()) return true;
    return row.name?.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Delivery Surge</h1>
          <p className="text-sm text-slate-500 font-medium">
            Zone-wise surge earnings credited to riders on successful delivery. Customer checkout surge stays under Billing.
          </p>
        </div>
        <button
          onClick={() => navigate("/admin/delivery-surges/new")}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20"
        >
          <Plus className="h-4 w-4" /> New Surge
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchList()}
              placeholder="Search by name..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm outline-none"
            />
          </div>
          <select
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value)}
            className="px-3 py-2.5 bg-slate-50 rounded-xl text-sm font-medium outline-none"
          >
            <option value="all">All zones</option>
            {zones.map((z) => (
              <option key={z._id} value={z._id}>
                {z.name}
              </option>
            ))}
          </select>
          <div className="flex bg-slate-100 p-1 rounded-xl overflow-x-auto">
            {["all", "active", "draft", "paused", "ended"].map((key) => (
              <button
                key={key}
                onClick={() => setStatus(key)}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold rounded-lg capitalize whitespace-nowrap",
                  status === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500",
                )}
              >
                {key}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 animate-pulse">Loading surges...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Zap className="h-8 w-8 mx-auto mb-2 text-slate-300" />
            <p className="font-medium">No delivery surges yet</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filtered.map((row) => (
              <div
                key={row._id}
                className="p-4 flex flex-col lg:flex-row lg:items-center gap-4 hover:bg-slate-50/80"
              >
                <button
                  className="flex-1 text-left"
                  onClick={() => navigate(`/admin/delivery-surges/${row._id}`)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-slate-900">{row.name}</h3>
                    <span
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase",
                        STATUS_STYLES[row.status],
                      )}
                    >
                      {row.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">
                    ₹{row.amount}
                    {row.zoneIds?.length
                      ? ` · ${(row.zoneIds || []).map((z) => z.name || z).join(", ")}`
                      : " · no zones"}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Applied {row.timesApplied || 0}× · Paid ₹{row.totalPaid || 0}
                    {row.priority ? ` · priority ${row.priority}` : ""}
                  </p>
                </button>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {row.status === "draft" || row.status === "paused" ? (
                    <button
                      onClick={() => changeStatus(row._id, "active")}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-50 text-emerald-700"
                    >
                      <Play className="h-3.5 w-3.5" /> Activate
                    </button>
                  ) : null}
                  {row.status === "active" ? (
                    <button
                      onClick={() => changeStatus(row._id, "paused")}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-50 text-amber-700"
                    >
                      <Pause className="h-3.5 w-3.5" /> Pause
                    </button>
                  ) : null}
                  {row.status === "active" || row.status === "paused" ? (
                    <button
                      onClick={() => changeStatus(row._id, "ended")}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 text-slate-600"
                    >
                      <Ban className="h-3.5 w-3.5" /> End
                    </button>
                  ) : null}
                  <button
                    onClick={() => navigate(`/admin/delivery-surges/${row._id}/edit`)}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-primary/10 text-primary"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(row._id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-rose-50 text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DeliverySurges;
