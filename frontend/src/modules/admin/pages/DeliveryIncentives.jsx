import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Gift, Search, Pause, Play, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminIncentiveApi } from "../services/api/incentiveApi";

const STATUS_STYLES = {
  draft: "bg-slate-100 text-slate-700",
  active: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-800",
  ended: "bg-slate-200 text-slate-600",
};

const DeliveryIncentives = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchList = async () => {
    try {
      setLoading(true);
      const res = await adminIncentiveApi.list({
        status: status === "all" ? undefined : status,
        limit: 100,
      });
      const payload = res.data.result || {};
      setItems(payload.items || []);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load incentives");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, [status]);

  const changeStatus = async (id, next) => {
    try {
      await adminIncentiveApi.setStatus(id, next);
      toast.success(`Incentive ${next}`);
      fetchList();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update status");
    }
  };

  const filtered = items.filter((row) => {
    if (!search.trim()) return true;
    return row.title?.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Delivery Incentives</h1>
          <p className="text-sm text-slate-500 font-medium">
            Create order-target offers. Bonus grants stay on the Delivery Bonus page.
          </p>
        </div>
        <button
          onClick={() => navigate("/admin/delivery-incentives/new")}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20"
        >
          <Plus className="h-4 w-4" /> New Incentive
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm outline-none"
            />
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl">
            {["all", "active", "draft", "paused", "ended"].map((key) => (
              <button
                key={key}
                onClick={() => setStatus(key)}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold rounded-lg capitalize",
                  status === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500",
                )}
              >
                {key}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 animate-pulse">Loading incentives...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Gift className="h-8 w-8 mx-auto mb-2 text-slate-300" />
            <p className="font-medium">No incentives yet</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filtered.map((row) => (
              <div key={row._id} className="p-4 flex flex-col lg:flex-row lg:items-center gap-4 hover:bg-slate-50/80">
                <button
                  className="flex-1 text-left"
                  onClick={() => navigate(`/admin/delivery-incentives/${row._id}`)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-slate-900">{row.title}</h3>
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold uppercase", STATUS_STYLES[row.status])}>
                      {row.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">
                    {row.targetOrders} orders / {row.periodType}
                    {row.repeatEveryPeriod ? " (repeats)" : ""} · ₹{row.amount}
                    {row.budgetCap != null ? ` · budget ₹${row.budgetCap}` : ""}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {new Date(row.startAt).toLocaleDateString("en-IN")} – {new Date(row.endAt).toLocaleDateString("en-IN")}
                    {" · "}
                    {row.audienceType} audience
                    {row.progressCounts?.earned ? ` · ${row.progressCounts.earned} earned` : ""}
                  </p>
                </button>
                <div className="flex items-center gap-2 shrink-0">
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
                    onClick={() => navigate(`/admin/delivery-incentives/${row._id}`)}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-primary/10 text-primary"
                  >
                    Manage
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

export default DeliveryIncentives;
