import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { sellerBestOffersApi } from "../services/bestOffersApi";

const EMPTY = { image: "", offerText: "", tagline: "Near & Fast", isEnabled: true, startsAt: "", endsAt: "" };

const toInputDate = (v) => (v ? new Date(v).toISOString().slice(0, 16) : "");

const BestOffers = () => {
  const [form, setForm] = useState(EMPTY);
  const [adminStatus, setAdminStatus] = useState("active");
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
        if (l && l.sellerId) {
          setForm({
            image: l.image || "",
            offerText: l.offerText || "",
            tagline: l.tagline || "",
            isEnabled: l.isEnabled !== false,
            startsAt: toInputDate(l.startsAt),
            endsAt: toInputDate(l.endsAt),
          });
          setAdminStatus(l.adminStatus || "active");
        }
      })
      .catch(() => toast.error("Failed to load Best Offers details"))
      .finally(() => setLoading(false));
  }, []);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

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
    setSaving(true);
    try {
      const res = await sellerBestOffersApi.saveMine({
        ...form,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      });
      setAdminStatus(res.data?.result?.adminStatus || "active");
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
        <h1 className="text-xl font-bold text-slate-900">Best Offers</h1>
        <p className="text-sm text-slate-500">
          Control how your store appears in the “Top Restaurants with Best Offers” section on the customer home page.
        </p>
      </div>

      {adminStatus === "hidden" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Your card has been hidden by the admin and is not shown to customers.
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_220px]">
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

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Offer text</label>
            <input
              value={form.offerText}
              maxLength={60}
              onChange={(e) => set("offerText", e.target.value)}
              placeholder="e.g. ₹100 OFF above ₹149"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
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

          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={form.isEnabled} onChange={(e) => set("isEnabled", e.target.checked)} />
            Show my store in Best Offers
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

        {/* Live preview */}
        <div>
          {/* SVG ClipPath Definition for the scooped notch */}
          <svg width="0" height="0" className="absolute pointer-events-none" aria-hidden="true">
            <defs>
              <clipPath id="sellerPreviewNotchClip" clipPathUnits="objectBoundingBox">
                <path d="M 0,0.12 C 0,0.05 0.05,0 0.12,0 L 0.88,0 C 0.95,0 1,0.05 1,0.12 L 1,0.88 C 1,0.95 0.95,1 0.88,1 L 0.50,1 C 0.44,1 0.42,0.75 0.36,0.75 L 0.10,0.75 C 0.04,0.75 0,0.71 0,0.63 Z" />
              </clipPath>
            </defs>
          </svg>

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Preview</p>
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

              {form.offerText && (
                <span className="absolute left-2 top-2 z-10 max-w-[calc(100%-1rem)] rounded-md bg-[#5d3ebd] px-2 py-0.5 text-xs font-bold leading-tight text-white line-clamp-2 shadow-sm pointer-events-none">
                  {form.offerText}
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
