import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Pause, Play, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminDeliverySurgeApi } from "../services/api/deliverySurgeApi";

const STATUS_STYLES = {
  draft: "bg-slate-100 text-slate-700",
  active: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-800",
  ended: "bg-slate-200 text-slate-600",
};

const DeliverySurgeDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [rule, setRule] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
      const res = await adminDeliverySurgeApi.get(id);
      setRule(res.data.result);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load surge");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const changeStatus = async (next) => {
    try {
      await adminDeliverySurgeApi.setStatus(id, next);
      toast.success(`Surge ${next}`);
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update status");
    }
  };

  if (loading && !rule) {
    return <div className="p-12 text-center text-slate-400 animate-pulse">Loading...</div>;
  }
  if (!rule) return null;

  const recent = rule.recentCredits || [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate("/admin/delivery-surges")}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 mt-0.5"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">{rule.name}</h1>
              <span
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase",
                  STATUS_STYLES[rule.status],
                )}
              >
                {rule.status}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              ₹{rule.amount} per delivery in{" "}
              {(rule.zoneIds || []).map((z) => z.name || z).join(", ") || "—"}
            </p>
            {rule.description ? (
              <p className="text-sm text-slate-400 mt-2">{rule.description}</p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {rule.status === "draft" || rule.status === "paused" ? (
            <button
              onClick={() => changeStatus("active")}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-50 text-emerald-700"
            >
              <Play className="h-3.5 w-3.5" /> Activate
            </button>
          ) : null}
          {rule.status === "active" ? (
            <button
              onClick={() => changeStatus("paused")}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-50 text-amber-700"
            >
              <Pause className="h-3.5 w-3.5" /> Pause
            </button>
          ) : null}
          {rule.status === "active" || rule.status === "paused" ? (
            <button
              onClick={() => changeStatus("ended")}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 text-slate-600"
            >
              <Ban className="h-3.5 w-3.5" /> End
            </button>
          ) : null}
          <button
            onClick={() => navigate(`/admin/delivery-surges/${id}/edit`)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-primary text-white"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Amount", value: `₹${rule.amount}` },
          { label: "Times applied", value: rule.timesApplied || 0 },
          { label: "Total paid", value: `₹${rule.totalPaid || 0}` },
          { label: "Priority", value: rule.priority || 0 },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{card.label}</p>
            <p className="text-xl font-black text-slate-900 mt-1">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">Recent credits</h2>
        </div>
        {recent.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No credits yet</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {recent.map((row) => (
              <div key={row._id || row.reference} className="p-4 flex justify-between gap-3 text-sm">
                <div>
                  <p className="font-bold text-slate-800">{row.meta?.orderId || row.reference}</p>
                  <p className="text-xs text-slate-400">
                    {row.meta?.zoneName || "—"} · {new Date(row.createdAt).toLocaleString("en-IN")}
                  </p>
                </div>
                <p className="font-black text-emerald-600">+₹{row.amount}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DeliverySurgeDetail;
