import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { sellerBestOffersApi } from "../services/bestOffersApi";

const EMPTY = {
  image: "",
  discountType: "percentage",
  discountValue: "",
  maxDiscount: "",
  minOrderValue: "",
  perUserLimit: "",
  newUsersOnly: false,
  tagline: "Near & Fast",
  isEnabled: true,
  startsAt: "",
  endsAt: "",
};

const toInputDate = (v) => (v ? new Date(v).toISOString().slice(0, 16) : "");

const round2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;

function formatRupee(n) {
  const num = Number(n || 0);
  return Number.isInteger(num) ? String(num) : num.toFixed(0);
}

function generateOfferText({ discountType, discountValue, maxDiscount, minOrderValue }) {
  const val = Number(discountValue || 0);
  if (!Number.isFinite(val) || val <= 0) return "";
  const maxCap = Number(maxDiscount || 0);
  const mov = Number(minOrderValue || 0);
  if (discountType === "flat") {
    return (`₹${formatRupee(val)} OFF` + (mov > 0 ? ` above ₹${formatRupee(mov)}` : "")).slice(0, 60);
  }
  let text = `${formatRupee(val)}% OFF`;
  if (maxCap > 0) text += ` up to ₹${formatRupee(maxCap)}`;
  else if (mov > 0) text += ` above ₹${formatRupee(mov)}`;
  return text.slice(0, 60);
}

const BestOffers = () => {
  const [form, setForm] = useState(EMPTY);
  const [adminStatus, setAdminStatus] = useState("active");
  const [exhaustedReason, setExhaustedReason] = useState(null);
  const [funding, setFunding] = useState({ sellerPct: 100, platformPct: 0 });
  const [budgetInfo, setBudgetInfo] = useState(null);
  const [commissionPct, setCommissionPct] = useState(0);
  const [guardrails, setGuardrails] = useState({
    minPlatformMargin: 5,
    minSellerPayoutPct: 60,
    allowCouponStacking: true,
    commissionBase: "discounted",
  });
  const [sampleOrderValue, setSampleOrderValue] = useState(400);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [rotateIndex, setRotateIndex] = useState(0);
  const fileRef = useRef(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setRotateIndex((p) => (p + 1) % 2);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    sellerBestOffersApi
      .getMine()
      .then((res) => {
        const l = res.data?.result;
        if (l) {
          if (l.commissionPct !== undefined) setCommissionPct(Number(l.commissionPct || 0));
          if (l.offerGuardrails) setGuardrails((g) => ({ ...g, ...l.offerGuardrails }));
          if (l.sellerId) {
            setForm({
              image: l.image || "",
              discountType: l.discountType || "percentage",
              discountValue: l.discountValue > 0 ? String(l.discountValue) : "",
              maxDiscount: l.maxDiscount > 0 ? String(l.maxDiscount) : "",
              minOrderValue: l.minOrderValue > 0 ? String(l.minOrderValue) : "",
              perUserLimit: l.perUserLimit > 0 ? String(l.perUserLimit) : "",
              newUsersOnly: Boolean(l.newUsersOnly),
              tagline: l.tagline || "",
              isEnabled: l.isEnabled !== false,
              startsAt: toInputDate(l.startsAt),
              endsAt: toInputDate(l.endsAt),
            });
            setAdminStatus(l.adminStatus || "active");
            setExhaustedReason(l.exhaustedReason || null);
            setFunding(l.funding || { sellerPct: 100, platformPct: 0 });
            setBudgetInfo({ ...(l.budget || {}), ...(l.budgetStatus || {}) });
          }
        }
      })
      .catch(() => toast.error("Failed to load Best Offers details"))
      .finally(() => setLoading(false));
  }, []);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const generatedOfferText = useMemo(
    () =>
      generateOfferText({
        discountType: form.discountType,
        discountValue: form.discountValue,
        maxDiscount: form.maxDiscount,
        minOrderValue: form.minOrderValue,
      }),
    [form.discountType, form.discountValue, form.maxDiscount, form.minOrderValue],
  );

  // Live simulation matching backend pricingService & checkoutPricingService
  const simulation = useMemo(() => {
    const subtotal = Math.max(1, Number(sampleOrderValue) || 400);
    const val = Math.max(0, Number(form.discountValue || 0));
    const maxCap = Math.max(0, Number(form.maxDiscount || 0));
    const mov = Math.max(0, Number(form.minOrderValue || 0));
    const sellerPct = Number(funding?.sellerPct ?? 100);
    const cRate = Math.max(0, Number(commissionPct || 0)) / 100;
    const minFloorPct = Number(guardrails?.minSellerPayoutPct ?? 60);

    const eligible = val > 0 && subtotal >= mov;
    let rawDiscount = 0;
    if (eligible) {
      rawDiscount = form.discountType === "flat" ? val : round2((subtotal * val) / 100);
      if (form.discountType === "percentage" && maxCap > 0) {
        rawDiscount = Math.min(rawDiscount, maxCap);
      }
      rawDiscount = round2(Math.min(rawDiscount, subtotal));
    }

    const sellerFunded = round2((rawDiscount * sellerPct) / 100);
    const platformFunded = round2(rawDiscount - sellerFunded);
    const commBase =
      guardrails.commissionBase === "original" ? subtotal : Math.max(0, subtotal - rawDiscount);
    const commissionAmt = round2(commBase * cRate);
    let sellerReceives = round2(Math.max(0, subtotal - sellerFunded - commissionAmt));

    const minAllowedPayout = round2((subtotal * minFloorPct) / 100);
    const floorBreached = eligible && sellerReceives + 0.01 < minAllowedPayout;

    return {
      subtotal,
      eligible,
      mov,
      customerSaves: rawDiscount,
      sellerFunded,
      platformFunded,
      commissionAmt,
      sellerReceives,
      payoutPct: round2((sellerReceives / subtotal) * 100),
      minFloorPct,
      floorBreached,
    };
  }, [sampleOrderValue, form, funding, commissionPct, guardrails]);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Please select an image file");
    if (file.size > 5 * 1024 * 1024) return toast.error("Image must be under 5 MB");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await sellerBestOffersApi.uploadMedia(fd);
      const url = res.data?.url || res.data?.result?.url || res.data?.result?.secureUrl || res.data?.secureUrl;
      if (!url) throw new Error("No URL returned");
      set("image", url);
    } catch {
      toast.error("Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (form.isEnabled && !form.image) return toast.error("Upload a card image first");
    const discountValNum = Number(form.discountValue || 0);
    if (form.isEnabled && discountValNum <= 0) {
      return toast.error("Enter a valid discount value greater than 0");
    }
    setSaving(true);
    try {
      const res = await sellerBestOffersApi.saveMine({
        image: form.image,
        discountType: form.discountType,
        discountValue: discountValNum,
        maxDiscount: form.discountType === "percentage" && form.maxDiscount !== "" ? Number(form.maxDiscount) : null,
        minOrderValue: form.minOrderValue !== "" ? Number(form.minOrderValue) : 0,
        perUserLimit: form.perUserLimit !== "" ? Number(form.perUserLimit) : null,
        newUsersOnly: Boolean(form.newUsersOnly),
        tagline: form.tagline,
        isEnabled: form.isEnabled,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      });
      const saved = res.data?.result;
      setAdminStatus(saved?.adminStatus || "active");
      setExhaustedReason(saved?.exhaustedReason || null);
      if (saved?.funding) setFunding(saved.funding);
      toast.success("Best Offers details saved");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading...</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Store Offers (Best Offers)</h1>
        <p className="text-sm text-slate-500">
          Create your seller-funded store discount. Your card text is auto-generated and applied automatically at checkout.
        </p>
      </div>

      {adminStatus === "hidden" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Your card has been hidden by the admin and is not shown to customers.
        </div>
      )}

      {exhaustedReason === "TOTAL_BUDGET_EXHAUSTED" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          This offer turned off automatically because the platform co-funding total budget ran out.
        </div>
      )}

      {budgetInfo?.dailyExhausted && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Today&apos;s platform daily budget for this offer is exhausted. It will automatically resume tomorrow.
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_240px]">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Card image</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
              >
                {uploading ? "Uploading..." : form.image ? "Replace image" : "Upload image"}
              </button>
              {form.image && (
                <button type="button" onClick={() => set("image", "")} className="text-sm text-red-600">
                  Remove
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
            </div>
            <p className="mt-1 text-xs text-slate-400">Use a bright photo of your best dish. Landscape works best; max 5 MB.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Discount type</label>
              <select
                value={form.discountType}
                onChange={(e) => set("discountType", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="flat">Flat amount (₹)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                {form.discountType === "percentage" ? "Discount (%)" : "Discount (₹)"}
              </label>
              <input
                type="number"
                min="0"
                max={form.discountType === "percentage" ? "95" : undefined}
                value={form.discountValue}
                onChange={(e) => set("discountValue", e.target.value)}
                placeholder={form.discountType === "percentage" ? "e.g. 50" : "e.g. 50"}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {form.discountType === "percentage" && (
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Max discount cap (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={form.maxDiscount}
                  onChange={(e) => set("maxDiscount", e.target.value)}
                  placeholder="e.g. 100"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Min order value (₹)</label>
              <input
                type="number"
                min="0"
                value={form.minOrderValue}
                onChange={(e) => set("minOrderValue", e.target.value)}
                placeholder="e.g. 199"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Per-user limit (optional)</label>
              <input
                type="number"
                min="1"
                step="1"
                value={form.perUserLimit}
                onChange={(e) => set("perUserLimit", e.target.value)}
                placeholder="Unlimited"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2">
            <span>
              Generated card label:{" "}
              <strong className="text-slate-900">{generatedOfferText || "Configure discount above"}</strong>
            </span>
            <span>
              Funding split:{" "}
              <strong className="text-slate-900">
                {funding.sellerPct}% You / {funding.platformPct}% Platform
              </strong>
            </span>
          </div>

          {/* Live Payout Preview */}
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-indigo-900">Live Order Preview</p>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-indigo-700">Sample order ₹</span>
                <input
                  type="number"
                  min="1"
                  value={sampleOrderValue}
                  onChange={(e) => setSampleOrderValue(e.target.value)}
                  className="w-20 rounded-md border border-indigo-200 bg-white px-2 py-1 text-xs font-bold text-slate-900"
                />
              </div>
            </div>

            {!simulation.eligible ? (
              <p className="text-xs text-indigo-800">
                {Number(form.discountValue || 0) <= 0
                  ? "Enter a discount value to preview how payouts split."
                  : `Order ₹${simulation.subtotal} is below the ₹${simulation.mov} minimum order value.`}
              </p>
            ) : (
              <p className="text-sm font-semibold text-slate-900">
                On a ₹{simulation.subtotal} order: customer saves{" "}
                <span className="text-emerald-700">₹{simulation.customerSaves}</span>, you receive{" "}
                <span className="text-indigo-700">₹{simulation.sellerReceives}</span>, platform commission{" "}
                <span className="text-slate-800">₹{simulation.commissionAmt}</span>
                {simulation.platformFunded > 0 && (
                  <span className="text-xs font-normal text-slate-600">
                    {" "}(platform funds ₹{simulation.platformFunded} of discount)
                  </span>
                )}
                .
              </p>
            )}

            <p className="text-[11px] text-slate-600">
              Commission base:{" "}
              <strong>
                {guardrails.commissionBase === "original" ? "Original subtotal" : "Discounted price (fairer)"}
              </strong>{" "}
              ({commissionPct}% max category rate) · Minimum seller floor:{" "}
              <strong>{simulation.minFloorPct}%</strong> of subtotal.
            </p>

            {simulation.floorBreached && (
              <p className="text-xs font-semibold text-red-600">
                Warning: Payout ({simulation.payoutPct}%) is below the {simulation.minFloorPct}% floor at ₹{simulation.subtotal}.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={form.newUsersOnly}
                onChange={(e) => set("newUsersOnly", e.target.checked)}
              />
              New users only
            </label>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Tagline</label>
            <input
              value={form.tagline}
              maxLength={30}
              onChange={(e) => set("tagline", e.target.value)}
              placeholder="Near & Fast"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Starts (optional)</label>
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => set("startsAt", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Ends (optional)</label>
              <input
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => set("endsAt", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Price inflation protection: While this offer is active, product price increases are locked against your 30-day lowest price.
          </div>

          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={form.isEnabled} onChange={(e) => set("isEnabled", e.target.checked)} />
            Show my store in Best Offers &amp; auto-apply at checkout
          </label>

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

        {/* Live Card Preview */}
        <div>
          <svg width="0" height="0" className="absolute pointer-events-none" aria-hidden="true">
            <defs>
              <clipPath id="sellerPreviewNotchClip" clipPathUnits="objectBoundingBox">
                <path d="M 0,0.12 C 0,0.05 0.05,0 0.12,0 L 0.88,0 C 0.95,0 1,0.05 1,0.12 L 1,0.88 C 1,0.95 0.95,1 0.88,1 L 0.50,1 C 0.44,1 0.42,0.75 0.36,0.75 L 0.10,0.75 C 0.04,0.75 0,0.71 0,0.63 Z" />
              </clipPath>
            </defs>
          </svg>

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Card Preview</p>
          <div className="w-[165px]">
            <div className="relative w-full aspect-[4/3] select-none">
              <div
                style={{
                  clipPath: "url(#sellerPreviewNotchClip)",
                  WebkitClipPath: "url(#sellerPreviewNotchClip)",
                }}
                className="w-full h-full bg-slate-100 overflow-hidden"
              >
                {form.image && <img src={form.image} alt="" className="h-full w-full object-cover" />}
              </div>

              {generatedOfferText && (
                <span className="absolute left-2 top-2 z-10 max-w-[calc(100%-1rem)] rounded-md bg-[#5d3ebd] px-2 py-0.5 text-xs font-bold leading-tight text-white line-clamp-2 shadow-sm pointer-events-none">
                  {generatedOfferText}
                </span>
              )}

              <div className="absolute left-0 bottom-0 z-10 flex items-center pointer-events-none">
                <span className="inline-flex items-center gap-1 rounded-full bg-[#137538] px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
                  <span>4.0</span>
                  <svg viewBox="0 0 20 20" className="h-2.5 w-2.5 fill-white" aria-hidden="true">
                    <path d="M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L10 14.9l-5.2 2.8 1-5.9L1.5 7.7l5.9-.8z" />
                  </svg>
                </span>
              </div>
            </div>

            <div className="mt-2.5 flex flex-col">
              <p className="truncate text-[14px] sm:text-[15px] font-bold text-[#1f2937] leading-tight">Your store name</p>
              <div className="mt-1 flex items-center gap-1 text-[12px] sm:text-[13px] font-semibold text-[#00a86b] h-5 overflow-hidden [perspective:500px]">
                <motion.div
                  animate={{ rotate: rotateIndex * 360 }}
                  transition={{ duration: 0.6, ease: "easeInOut" }}
                  className="shrink-0 flex items-center justify-center"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-[#00a86b] text-[#00a86b]" aria-hidden="true">
                    <path d="M13 2L3 14h8l-1 8 11-13h-8l1-7z" />
                  </svg>
                </motion.div>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={rotateIndex % 2 === 1 ? "time" : "tagline"}
                    initial={{ rotateX: 360, opacity: 0 }}
                    animate={{ rotateX: 0, opacity: 1 }}
                    exit={{ rotateX: -360, opacity: 0 }}
                    transition={{ duration: 0.6, ease: "easeInOut" }}
                    style={{ display: "inline-block", transformOrigin: "center center" }}
                    className="truncate"
                  >
                    {rotateIndex % 2 === 1 ? "10-15 mins" : (form.tagline || "Near & Fast")}
                  </motion.span>
                </AnimatePresence>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">The rating badge is calculated automatically from customer reviews.</p>
        </div>
      </div>
    </div>
  );
};

export default BestOffers;
