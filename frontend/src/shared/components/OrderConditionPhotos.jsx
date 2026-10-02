import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Loader2, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import axiosInstance from "@core/api/axios";

const CONDITIONS = [
  { value: "GOOD", label: "Good", cls: "bg-green-50 text-green-700 border-green-300" },
  { value: "MINOR_ISSUE", label: "Minor issue", cls: "bg-amber-50 text-amber-700 border-amber-300" },
  { value: "DAMAGED", label: "Damaged", cls: "bg-red-50 text-red-700 border-red-300" },
];

const MAX_PER_UPLOAD = 8;

/**
 * Product-condition photo proof for one stage of an order.
 *  - stage "SELLER_DISPATCH": seller, before packing / handing the order over
 *  - stage "RIDER_PICKUP": delivery partner, order as received at the store
 *
 * Photos are append-only (they are audit evidence for the admin). Calls
 * `onStatusChange(hasPhotos)` so the parent can unlock the next step.
 */
const OrderConditionPhotos = ({ orderId, stage, title, hint, items = [], onStatusChange }) => {
  const [saved, setSaved] = useState(null); // existing evidence doc for this stage
  const [loading, setLoading] = useState(true);
  const [staged, setStaged] = useState([]); // [{ url, preview }]
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [condition, setCondition] = useState("GOOD");
  const [note, setNote] = useState("");
  const [productId, setProductId] = useState("");
  const fileRef = useRef(null);
  const onStatusRef = useRef(onStatusChange);
  onStatusRef.current = onStatusChange;

  const load = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await axiosInstance.get(`/order-evidence/${encodeURIComponent(orderId)}`);
      const doc = (res.data?.result?.evidence || []).find((d) => d.stage === stage) || null;
      setSaved(doc);
      onStatusRef.current?.(Boolean(doc?.images?.length));
    } catch {
      onStatusRef.current?.(false);
    } finally {
      setLoading(false);
    }
  }, [orderId, stage]);

  useEffect(() => {
    setLoading(true);
    setStaged([]);
    load();
  }, [load]);

  const fileToDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const processFiles = async (files) => {
    if (!files.length) return;
    const room = MAX_PER_UPLOAD - staged.length;
    if (room <= 0) {
      toast.error(`You can add up to ${MAX_PER_UPLOAD} photos at a time`);
      return;
    }
    setUploading(true);
    const next = [];
    for (const file of files.slice(0, room)) {
      try {
        const preview = await fileToDataUrl(file);
        const form = new FormData();
        form.append("file", file);
        const res = await axiosInstance.post("/media/upload", form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        const url = res.data?.result?.secureUrl || res.data?.result?.url;
        if (!url) throw new Error("Upload failed");
        next.push({ url, preview });
      } catch (error) {
        toast.error(error.response?.data?.message || error.message || "Photo upload failed");
      }
    }
    setStaged((prev) => [...prev, ...next]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const openCamera = async () => {
    // Same Flutter-bridge camera used elsewhere in the delivery app, falling back to the file picker.
    if (window.flutter_inappwebview?.callHandler) {
      try {
        const result = await window.flutter_inappwebview.callHandler("openCamera");
        if (result?.success && result.base64) {
          const bytes = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));
          const file = new File([bytes], result.fileName || "photo.jpg", {
            type: result.mimeType || "image/jpeg",
          });
          processFiles([file]);
          return;
        }
      } catch {
        /* fall through to the file input */
      }
    }
    fileRef.current?.click();
  };

  const save = async () => {
    if (staged.length === 0) {
      toast.error("Add at least one photo first");
      return;
    }
    setSaving(true);
    try {
      await axiosInstance.post(`/order-evidence/${encodeURIComponent(orderId)}`, {
        images: staged.map((s) => ({ url: s.url, ...(productId ? { productId } : {}) })),
        condition,
        note,
      });
      toast.success("Product condition photos saved");
      setStaged([]);
      setNote("");
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not save photos");
    } finally {
      setSaving(false);
    }
  };

  const hasSaved = Boolean(saved?.images?.length);

  return (
    <div
      className={`rounded-2xl border p-3 sm:p-4 ${
        hasSaved ? "border-green-200 bg-green-50/40" : "border-amber-200 bg-amber-50/50"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <h4 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
            <Camera className="h-4 w-4" /> {title}
          </h4>
          {hint && <p className="text-[11px] text-slate-600 mt-0.5">{hint}</p>}
        </div>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        ) : hasSaved ? (
          <span className="flex items-center gap-1 text-[10px] font-bold text-green-700">
            <CheckCircle2 className="h-4 w-4" /> {saved.images.length} saved
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700">
            <AlertTriangle className="h-4 w-4" /> Required
          </span>
        )}
      </div>

      {hasSaved && (
        <div className="flex flex-wrap gap-2 mb-3">
          {saved.images.map((img) => (
            <a key={img._id || img.url} href={img.url} target="_blank" rel="noopener noreferrer">
              <img src={img.url} alt="Saved" className="h-14 w-14 rounded-lg object-cover border border-white shadow" />
            </a>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-2">
        {staged.map((s, i) => (
          <div key={s.url} className="relative">
            <img src={s.preview} alt="New" className="h-14 w-14 rounded-lg object-cover border border-slate-200" />
            <button
              type="button"
              onClick={() => setStaged((prev) => prev.filter((_, idx) => idx !== i))}
              className="absolute -top-1.5 -right-1.5 bg-white rounded-full shadow p-0.5"
            >
              <X className="h-3 w-3 text-slate-600" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={openCamera}
          disabled={uploading}
          className="h-14 w-14 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-500 hover:bg-white disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => processFiles(Array.from(e.target.files || []))}
        />
      </div>

      {staged.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {CONDITIONS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCondition(c.value)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                  condition === c.value ? c.cls : "bg-white text-slate-500 border-slate-200"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          {items.length > 1 && (
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
            >
              <option value="">All products in this order</option>
              {items.map((item, i) => (
                <option key={`${item.productId || item.product || i}`} value={item.productId || item.product || ""}>
                  {item.name}
                </option>
              ))}
            </select>
          )}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="Note about the product condition (optional)"
            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
          />
          <button
            type="button"
            onClick={save}
            disabled={saving || uploading}
            className="w-full bg-slate-900 text-white rounded-xl py-2 text-xs font-bold disabled:opacity-60"
          >
            {saving ? "Saving..." : `SAVE ${staged.length} PHOTO${staged.length > 1 ? "S" : ""}`}
          </button>
        </div>
      )}

      {hasSaved && saved.condition && (
        <p className="text-[11px] text-slate-600 mt-2">
          Recorded condition: <b>{saved.condition.replace("_", " ")}</b>
          {saved.note ? ` — ${saved.note}` : ""}
        </p>
      )}
    </div>
  );
};

export default OrderConditionPhotos;
