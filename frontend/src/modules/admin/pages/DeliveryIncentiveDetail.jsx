import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Pause, Play, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminIncentiveApi } from "../services/api/incentiveApi";

const STATUS_STYLES = {
  draft: "bg-slate-100 text-slate-700",
  active: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-800",
  ended: "bg-slate-200 text-slate-600",
  in_progress: "bg-blue-100 text-blue-700",
  earned: "bg-emerald-100 text-emerald-700",
  expired: "bg-slate-100 text-slate-600",
  ineligible: "bg-rose-100 text-rose-700",
};

const DeliveryIncentiveDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [progress, setProgress] = useState([]);
  const [progressStatus, setProgressStatus] = useState("all");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
      const [cRes, pRes] = await Promise.all([
        adminIncentiveApi.get(id),
        adminIncentiveApi.getProgress(id, {
          status: progressStatus === "all" ? undefined : progressStatus,
          limit: 100,
        }),
      ]);
      setCampaign(cRes.data.result);
      setProgress(pRes.data.result?.items || []);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load incentive");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id, progressStatus]);

  const changeStatus = async (next) => {
    try {
      await adminIncentiveApi.setStatus(id, next);
      toast.success(`Incentive ${next}`);
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update status");
    }
  };

  if (loading && !campaign) {
    return <div className="p-12 text-center text-slate-400 animate-pulse">Loading...</div>;
  }
  if (!campaign) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-start gap-3">
          <button onClick={() => navigate("/admin/delivery-incentives")} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 mt-0.5">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">{campaign.title}</h1>
              <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold uppercase", STATUS_STYLES[campaign.status])}>
                {campaign.status}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Complete {campaign.targetOrders} orders / {campaign.periodType} to earn ₹{campaign.amount}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {new Date(campaign.startAt).toLocaleDateString("en-IN")} – {new Date(campaign.endAt).toLocaleDateString("en-IN")}
              {" · "}{campaign.audienceType} audience
              {campaign.repeatEveryPeriod ? " · repeats" : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => navigate(`/admin/delivery-incentives/${id}/edit`)}
            className="inline-flex items-center gap-1 px-3 py-2 text-xs font-bold rounded-xl bg-slate-100"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
          {campaign.status === "draft" || campaign.status === "paused" ? (
            <button onClick={() => changeStatus("active")} className="inline-flex items-center gap-1 px-3 py-2 text-xs font-bold rounded-xl bg-emerald-50 text-emerald-700">
              <Play className="h-3.5 w-3.5" /> Activate
            </button>
          ) : null}
          {campaign.status === "active" ? (
            <button onClick={() => changeStatus("paused")} className="inline-flex items-center gap-1 px-3 py-2 text-xs font-bold rounded-xl bg-amber-50 text-amber-700">
              <Pause className="h-3.5 w-3.5" /> Pause
            </button>
          ) : null}
          {campaign.status !== "ended" ? (
            <button onClick={() => changeStatus("ended")} className="inline-flex items-center gap-1 px-3 py-2 text-xs font-bold rounded-xl bg-slate-100 text-slate-600">
              <Ban className="h-3.5 w-3.5" /> End
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid sm:grid-cols-4 gap-3">
        {[
          ["Paid out", `₹${campaign.paidAmount || 0}`, `${campaign.paidCount || 0} payouts`],
          ["Spent / budget", `₹${campaign.spentAmount || 0}`, campaign.budgetCap != null ? `cap ₹${campaign.budgetCap}` : "no cap"],
          ["In progress", campaign.progressCounts?.in_progress || 0, "current periods"],
          ["Assigned", campaign.assignedCount || 0, campaign.audienceType],
        ].map(([label, value, sub]) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-100 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
            <p className="text-xl font-black text-slate-900 mt-1">{value}</p>
            <p className="text-xs text-slate-500">{sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-900">Rider progress</h2>
          <div className="flex bg-slate-100 p-1 rounded-xl">
            {["all", "in_progress", "earned", "expired", "ineligible"].map((key) => (
              <button
                key={key}
                onClick={() => setProgressStatus(key)}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-bold rounded-lg capitalize",
                  progressStatus === key ? "bg-white shadow-sm text-slate-900" : "text-slate-500",
                )}
              >
                {key.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>
        {progress.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No progress rows yet.</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {progress.map((row) => (
              <div key={row._id} className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-slate-900">{row.deliveryId?.name || "Rider"}</p>
                  <p className="text-xs text-slate-500">{row.deliveryId?.phone} · {row.periodKey}</p>
                </div>
                <p className="text-sm font-bold text-slate-800">
                  {row.completedOrders}/{row.targetOrders}
                </p>
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold uppercase", STATUS_STYLES[row.status])}>
                  {row.status}
                </span>
                <p className="text-sm font-black text-emerald-600">₹{row.amount}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DeliveryIncentiveDetail;
