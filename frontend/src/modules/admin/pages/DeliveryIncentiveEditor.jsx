import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Check, Search, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminIncentiveApi } from "../services/api/incentiveApi";

const emptyForm = {
  title: "",
  description: "",
  amount: "100",
  targetOrders: "10",
  periodType: "daily",
  repeatEveryPeriod: true,
  startAt: "",
  endAt: "",
  audienceType: "all",
  verifiedOnly: true,
  currentlyOnline: "",
  minRating: "",
  minLifetimeOrders: "",
  joiningFrom: "",
  joiningTo: "",
  zoneIds: [],
  requireVerifiedAtPayout: true,
  budgetCap: "",
  maxPayoutsPerRider: "",
  status: "draft",
};

function toIstDateInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

const DeliveryIncentiveEditor = () => {
  const { id } = useParams();
  const isEdit = Boolean(id) && id !== "new";
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [zones, setZones] = useState([]);
  const [partners, setPartners] = useState([]);
  const [partnerTotal, setPartnerTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [partnerSearch, setPartnerSearch] = useState("");
  const [partnerPage, setPartnerPage] = useState(1);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const partnerFilters = useMemo(
    () => ({
      search: partnerSearch || undefined,
      zoneIds: form.zoneIds.length ? form.zoneIds : undefined,
      verifiedOnly: form.verifiedOnly,
      currentlyOnline: form.currentlyOnline === "" ? undefined : form.currentlyOnline === "true",
      minRating: form.minRating || undefined,
      minLifetimeOrders: form.minLifetimeOrders || undefined,
      joiningFrom: form.joiningFrom || undefined,
      joiningTo: form.joiningTo || undefined,
      page: partnerPage,
      limit: 25,
    }),
    [partnerSearch, form.zoneIds, form.verifiedOnly, form.currentlyOnline, form.minRating, form.minLifetimeOrders, form.joiningFrom, form.joiningTo, partnerPage],
  );

  const fetchPartners = async () => {
    try {
      const res = await adminIncentiveApi.eligiblePartners(partnerFilters);
      const payload = res.data.result || {};
      setPartners(payload.items || []);
      setPartnerTotal(payload.total || 0);
      if (payload.filters?.zones) setZones(payload.filters.zones);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load partners");
    }
  };

  useEffect(() => {
    fetchPartners();
  }, [partnerFilters]);

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        setLoading(true);
        const res = await adminIncentiveApi.get(id);
        const c = res.data.result;
        setForm({
          title: c.title || "",
          description: c.description || "",
          amount: String(c.amount ?? ""),
          targetOrders: String(c.targetOrders ?? ""),
          periodType: c.periodType || "daily",
          repeatEveryPeriod: c.repeatEveryPeriod !== false,
          startAt: toIstDateInput(c.startAt),
          endAt: toIstDateInput(c.endAt),
          audienceType: c.audienceType || "all",
          verifiedOnly: c.filters?.verifiedOnly !== false,
          currentlyOnline:
            c.filters?.currentlyOnline == null ? "" : String(Boolean(c.filters.currentlyOnline)),
          minRating: c.filters?.minRating != null ? String(c.filters.minRating) : "",
          minLifetimeOrders:
            c.filters?.minLifetimeOrders != null ? String(c.filters.minLifetimeOrders) : "",
          joiningFrom: toIstDateInput(c.filters?.joiningFrom),
          joiningTo: toIstDateInput(c.filters?.joiningTo),
          zoneIds: (c.filters?.zoneIds || []).map(String),
          requireVerifiedAtPayout: c.conditions?.requireVerifiedAtPayout !== false,
          budgetCap: c.budgetCap != null ? String(c.budgetCap) : "",
          maxPayoutsPerRider: c.maxPayoutsPerRider != null ? String(c.maxPayoutsPerRider) : "",
          status: c.status || "draft",
        });
        if (c.assignedPartners?.length) {
          setSelectedIds(new Set(c.assignedPartners.map((p) => String(p._id))));
        }
      } catch (error) {
        toast.error(error?.response?.data?.message || "Failed to load incentive");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isEdit]);

  const togglePartner = (pid) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  const togglePage = () => {
    const ids = partners.map((p) => String(p._id));
    const allSelected = ids.every((pid) => selectedIds.has(pid));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((pid) => (allSelected ? next.delete(pid) : next.add(pid)));
      return next;
    });
  };

  const selectAllMatching = async () => {
    try {
      const res = await adminIncentiveApi.eligiblePartners({ ...partnerFilters, page: 1, limit: 200 });
      const items = res.data.result?.items || [];
      setSelectedIds((prev) => {
        const next = new Set(prev);
        items.forEach((p) => next.add(String(p._id)));
        return next;
      });
      toast.success(`Added ${items.length} matching partners from this page size`);
    } catch {
      toast.error("Failed to select matching partners");
    }
  };

  const buildPayload = (status) => ({
    title: form.title.trim(),
    description: form.description.trim(),
    amount: Number(form.amount),
    targetOrders: Number(form.targetOrders),
    periodType: form.periodType,
    repeatEveryPeriod: form.periodType === "custom" ? false : form.repeatEveryPeriod,
    startAt: form.startAt,
    endAt: form.endAt,
    audienceType: form.audienceType,
    status,
    filters: {
      zoneIds: form.zoneIds,
      verifiedOnly: form.verifiedOnly,
      currentlyOnline: form.currentlyOnline === "" ? null : form.currentlyOnline === "true",
      minRating: form.minRating ? Number(form.minRating) : null,
      minLifetimeOrders: form.minLifetimeOrders ? Number(form.minLifetimeOrders) : null,
      joiningFrom: form.joiningFrom || null,
      joiningTo: form.joiningTo || null,
    },
    conditions: {
      countOnlyDelivered: true,
      requireVerifiedAtPayout: form.requireVerifiedAtPayout,
      excludeReturns: false,
    },
    budgetCap: form.budgetCap ? Number(form.budgetCap) : null,
    maxPayoutsPerRider: form.maxPayoutsPerRider ? Number(form.maxPayoutsPerRider) : null,
    deliveryIds: form.audienceType === "specific" ? [...selectedIds] : [],
  });

  const save = async (status) => {
    if (!form.title.trim() || !form.amount || !form.targetOrders || !form.startAt || !form.endAt) {
      toast.error("Fill title, amount, target, start and end dates");
      return;
    }
    if (form.audienceType === "specific" && selectedIds.size === 0) {
      toast.error("Select at least one delivery partner");
      return;
    }
    try {
      setSaving(true);
      const payload = buildPayload(status);
      if (isEdit) {
        await adminIncentiveApi.update(id, payload);
        toast.success("Incentive updated");
        navigate(`/admin/delivery-incentives/${id}`);
      } else {
        const res = await adminIncentiveApi.create(payload);
        const created = res.data.result;
        toast.success(status === "active" ? "Incentive activated" : "Incentive saved as draft");
        navigate(`/admin/delivery-incentives/${created._id}`);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save incentive");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-slate-400 animate-pulse">Loading...</div>;
  }

  const inputClass =
    "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20";

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/admin/delivery-incentives")}
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            {isEdit ? "Edit Incentive" : "New Incentive"}
          </h1>
          <p className="text-sm text-slate-500">Order-target offer for delivery partners</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
        <h2 className="font-bold text-slate-900">Offer rules</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Title</label>
            <input className={inputClass} value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder="Complete 10 orders today" />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Description</label>
            <textarea className={inputClass} rows={2} value={form.description} onChange={(e) => setField("description", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Incentive amount (₹)</label>
            <input type="number" min="1" className={inputClass} value={form.amount} onChange={(e) => setField("amount", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Target orders</label>
            <input type="number" min="1" className={inputClass} value={form.targetOrders} onChange={(e) => setField("targetOrders", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Period</label>
            <select className={inputClass} value={form.periodType} onChange={(e) => setField("periodType", e.target.value)}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom window</option>
            </select>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              id="repeat"
              type="checkbox"
              checked={form.periodType !== "custom" && form.repeatEveryPeriod}
              disabled={form.periodType === "custom"}
              onChange={(e) => setField("repeatEveryPeriod", e.target.checked)}
            />
            <label htmlFor="repeat" className="text-sm font-medium text-slate-700">
              Repeat every period between start and end
            </label>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Start date</label>
            <input type="date" className={inputClass} value={form.startAt} onChange={(e) => setField("startAt", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">End date</label>
            <input type="date" className={inputClass} value={form.endAt} onChange={(e) => setField("endAt", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Budget cap (₹, optional)</label>
            <input type="number" min="0" className={inputClass} value={form.budgetCap} onChange={(e) => setField("budgetCap", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Max payouts per rider (optional)</label>
            <input type="number" min="1" className={inputClass} value={form.maxPayoutsPerRider} onChange={(e) => setField("maxPayoutsPerRider", e.target.value)} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
        <h2 className="font-bold text-slate-900">Who is eligible</h2>
        <div className="flex flex-wrap gap-2">
          {[
            { id: "all", label: "All verified partners" },
            { id: "filtered", label: "Live filters" },
            { id: "specific", label: "Specific partners" },
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => setField("audienceType", opt.id)}
              className={cn(
                "px-3 py-2 rounded-xl text-xs font-bold border",
                form.audienceType === opt.id
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-slate-600 border-slate-200",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {form.audienceType !== "all" && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={form.verifiedOnly} onChange={(e) => setField("verifiedOnly", e.target.checked)} />
              Verified only
            </label>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 uppercase">Online status</label>
              <select className={inputClass} value={form.currentlyOnline} onChange={(e) => setField("currentlyOnline", e.target.value)}>
                <option value="">Any</option>
                <option value="true">Online</option>
                <option value="false">Offline</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 uppercase">Min rating</label>
              <input type="number" min="0" max="5" step="0.1" className={inputClass} value={form.minRating} onChange={(e) => setField("minRating", e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 uppercase">Min lifetime orders</label>
              <input type="number" min="0" className={inputClass} value={form.minLifetimeOrders} onChange={(e) => setField("minLifetimeOrders", e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 uppercase">Joined from</label>
              <input type="date" className={inputClass} value={form.joiningFrom} onChange={(e) => setField("joiningFrom", e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 uppercase">Joined to</label>
              <input type="date" className={inputClass} value={form.joiningTo} onChange={(e) => setField("joiningTo", e.target.value)} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3 space-y-1">
              <label className="text-[11px] font-bold text-slate-500 uppercase">Zones</label>
              <div className="flex flex-wrap gap-2">
                {zones.map((z) => {
                  const selected = form.zoneIds.includes(z.id);
                  return (
                    <button
                      key={z.id}
                      type="button"
                      onClick={() =>
                        setField(
                          "zoneIds",
                          selected ? form.zoneIds.filter((id) => id !== z.id) : [...form.zoneIds, z.id],
                        )
                      }
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-bold border",
                        selected ? "bg-primary/10 text-primary border-primary/30" : "bg-slate-50 text-slate-600 border-slate-200",
                      )}
                    >
                      {z.name}
                    </button>
                  );
                })}
                {zones.length === 0 && <span className="text-xs text-slate-400">No zones configured</span>}
              </div>
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={form.requireVerifiedAtPayout}
            onChange={(e) => setField("requireVerifiedAtPayout", e.target.checked)}
          />
          Rider must still be verified at payout time
        </label>

        {form.audienceType === "specific" && (
          <div className="border border-slate-100 rounded-xl overflow-hidden">
            <div className="p-3 bg-slate-50 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  value={partnerSearch}
                  onChange={(e) => {
                    setPartnerPage(1);
                    setPartnerSearch(e.target.value);
                  }}
                  placeholder="Search name or phone"
                  className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
                />
              </div>
              <button onClick={togglePage} className="px-3 py-2 text-xs font-bold rounded-lg bg-white border border-slate-200">
                Toggle page
              </button>
              <button onClick={selectAllMatching} className="px-3 py-2 text-xs font-bold rounded-lg bg-primary/10 text-primary">
                Add matching (up to 200)
              </button>
            </div>
            <div className="px-3 py-2 text-xs font-bold text-slate-500">
              {selectedIds.size} selected · {partnerTotal} matching filters
            </div>
            <div className="max-h-80 overflow-auto divide-y divide-slate-50">
              {partners.map((p) => {
                const pid = String(p._id);
                const checked = selectedIds.has(pid);
                return (
                  <label key={pid} className="flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={checked} onChange={() => togglePartner(pid)} />
                    <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary font-bold flex items-center justify-center overflow-hidden">
                      {p.profileImage ? <img src={p.profileImage} alt="" className="h-full w-full object-cover" /> : p.name?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-slate-900 truncate">{p.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {p.phone} · {p.zoneName} · {p.totalDeliveries} orders
                      </p>
                    </div>
                    <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                      <Star className="h-3 w-3 text-amber-500" /> {Number(p.averageRating || 0).toFixed(1)}
                    </span>
                  </label>
                );
              })}
            </div>
            {partnerTotal > 25 && (
              <div className="p-3 flex justify-end gap-2">
                <button disabled={partnerPage <= 1} onClick={() => setPartnerPage((p) => p - 1)} className="px-3 py-1 text-xs font-bold rounded-lg bg-slate-100 disabled:opacity-40">
                  Prev
                </button>
                <button
                  disabled={partnerPage * 25 >= partnerTotal}
                  onClick={() => setPartnerPage((p) => p + 1)}
                  className="px-3 py-1 text-xs font-bold rounded-lg bg-slate-100 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 justify-end pb-8">
        <button
          disabled={saving}
          onClick={() => save("draft")}
          className="px-4 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-700"
        >
          Save draft
        </button>
        <button
          disabled={saving}
          onClick={() => save("active")}
          className="px-4 py-2.5 rounded-xl font-bold text-sm bg-primary text-white inline-flex items-center gap-2"
        >
          <Check className="h-4 w-4" /> {saving ? "Saving..." : "Save & activate"}
        </button>
      </div>
    </div>
  );
};

export default DeliveryIncentiveEditor;
