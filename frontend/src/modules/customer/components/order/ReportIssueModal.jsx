import React, { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import axiosInstance from "@core/api/axios";
import { customerApi } from "../../services/customerApi";

const ISSUE_TYPES = [
  { value: "PRODUCT_DAMAGED", label: "Product damaged" },
  { value: "CONDITION_MISMATCH", label: "Product condition not as expected" },
  { value: "DAMAGED_IN_DELIVERY", label: "Product damaged during delivery" },
  { value: "WRONG_PRODUCT", label: "Wrong product received" },
  { value: "MISSING_PRODUCT", label: "Product missing" },
  { value: "SELLER_ISSUE", label: "Issue with the seller" },
  { value: "DELIVERY_ISSUE", label: "Issue with the delivery partner" },
  { value: "OTHER", label: "Something else" },
];

const MAX_PHOTOS = 5;

/**
 * Customer reports a problem with an order. Creates a support ticket linked to the
 * order so the admin can investigate (seller / rider photos, timeline) before deciding
 * whether any penalty is due. Raising an issue never penalises anyone by itself.
 */
const ReportIssueModal = ({ isOpen, onClose, order }) => {
  const [issueType, setIssueType] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState([]); // [{ url, preview }]
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef(null);

  if (!isOpen || !order) return null;

  const toDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleFiles = async (files) => {
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      toast.error(`You can add up to ${MAX_PHOTOS} photos`);
      return;
    }
    setUploading(true);
    const next = [];
    for (const file of files.slice(0, room)) {
      try {
        const preview = await toDataUrl(file);
        const form = new FormData();
        form.append("file", file);
        const res = await axiosInstance.post("/media/upload", form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        const url = res.data?.result?.secureUrl || res.data?.result?.url;
        if (!url) throw new Error("Upload failed");
        next.push({ url, preview });
      } catch (error) {
        toast.error(error.response?.data?.message || "Photo upload failed");
      }
    }
    setPhotos((prev) => [...prev, ...next]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async () => {
    if (!issueType) {
      toast.error("Please select what went wrong");
      return;
    }
    if (description.trim().length < 10) {
      toast.error("Please describe the issue (at least 10 characters)");
      return;
    }
    setSubmitting(true);
    try {
      const label = ISSUE_TYPES.find((t) => t.value === issueType)?.label || "Issue";
      await customerApi.createTicket({
        subject: `Order #${order.orderId}: ${label}`,
        description: description.trim(),
        priority: "high",
        userType: "Customer",
        orderId: order.orderId,
        issueType,
        attachments: photos.map((p) => p.url),
      });
      toast.success("Issue reported. Our team will review your order and get back to you.");
      setIssueType("");
      setDescription("");
      setPhotos([]);
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not report the issue");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-black text-slate-900">Report an issue</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Order #{order.orderId}. Our team will check the order history and photos before taking any action.
          Want to send the item back? Use "Return" on this order instead.
        </p>

        <label className="text-xs font-bold text-slate-500 uppercase">What went wrong?</label>
        <select
          value={issueType}
          onChange={(e) => setIssueType(e.target.value)}
          className="mt-1 mb-3 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white"
        >
          <option value="">Select an issue</option>
          {ISSUE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        <label className="text-xs font-bold text-slate-500 uppercase">Describe the issue</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder="Tell us what happened…"
          className="mt-1 mb-3 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
        />

        <label className="text-xs font-bold text-slate-500 uppercase">Photos (recommended)</label>
        <div className="mt-1 mb-4 flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={p.url} className="relative">
              <img src={p.preview} alt="Issue" className="h-16 w-16 rounded-lg object-cover border border-slate-200" />
              <button
                type="button"
                onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                className="absolute -top-1.5 -right-1.5 bg-white rounded-full shadow p-0.5"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="h-16 w-16 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-500 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="animate-spin" size={20} /> : <Camera size={20} />}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(Array.from(e.target.files || []))}
          />
        </div>

        <button
          onClick={submit}
          disabled={submitting || uploading}
          className="w-full bg-slate-900 text-white font-bold rounded-2xl py-3 disabled:opacity-60"
        >
          {submitting ? "Submitting..." : "Submit issue"}
        </button>
      </div>
    </div>
  );
};

export default ReportIssueModal;
