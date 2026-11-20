import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Star, X } from "lucide-react";
import { toast } from "sonner";
import axiosInstance from "@core/api/axios";
import { customerApi } from "../../services/customerApi";

const MAX_PHOTOS = 5;

const ProductReviewModal = ({ isOpen, onClose, orderId, item, onSaved }) => {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    setRating(item?.review?.rating || 5);
    setComment(item?.review?.comment || "");
    setPhotos((item?.review?.images || []).map((url) => ({ url, preview: url })));
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const uploadFiles = async (files) => {
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) return toast.error(`You can add up to ${MAX_PHOTOS} photos`);
    setUploading(true);
    const uploaded = [];
    for (const file of files.slice(0, room)) {
      try {
        const form = new FormData();
        form.append("file", file);
        const response = await axiosInstance.post("/media/upload", form, { headers: { "Content-Type": "multipart/form-data" } });
        const url = response.data?.result?.secureUrl || response.data?.result?.url;
        if (!url) throw new Error("Upload failed");
        uploaded.push({ url, preview: URL.createObjectURL(file) });
      } catch (error) {
        toast.error(error.response?.data?.message || "Photo upload failed");
      }
    }
    setPhotos((current) => [...current, ...uploaded]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const payload = { rating, comment: comment.trim(), images: photos.map((photo) => photo.url) };
      const response = item.review?._id
        ? await customerApi.updateReview(item.review._id, payload)
        : await customerApi.submitReview({ ...payload, orderId, productId: item.productId });
      toast.success(item.review ? "Review updated and sent for approval" : "Review sent for approval");
      await onSaved?.(response.data?.result);
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not save your review");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center" data-lenis-prevent>
      <button aria-label="Close review" className="absolute inset-0 bg-slate-950/55" onClick={onClose} />
      <section className="relative w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Verified purchase</p>
            <h3 className="mt-1 text-lg font-black text-slate-900">Review {item.name}</h3>
          </div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-slate-100"><X size={19} /></button>
        </div>

        <div className="mt-5 flex justify-center gap-2" aria-label={`${rating} out of 5 stars`}>
          {[1, 2, 3, 4, 5].map((value) => (
            <button key={value} type="button" onClick={() => setRating(value)} className="rounded-xl p-2 hover:bg-amber-50" aria-label={`${value} stars`}>
              <Star size={30} className={value <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300"} />
            </button>
          ))}
        </div>

        <label className="mt-5 block text-xs font-bold uppercase text-slate-500" htmlFor="product-review-comment">Your experience (optional)</label>
        <textarea id="product-review-comment" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} rows={4} placeholder="What did you like or dislike?" className="mt-2 w-full resize-none rounded-2xl border border-slate-200 p-3 text-sm outline-none focus:border-emerald-600" />

        <p className="mt-4 text-xs font-bold uppercase text-slate-500">Photos (optional)</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {photos.map((photo, index) => (
            <div className="relative" key={`${photo.url}-${index}`}>
              <img src={photo.preview} alt="Review attachment" className="h-16 w-16 rounded-xl border object-cover" />
              <button type="button" onClick={() => setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index))} className="absolute -right-1 -top-1 rounded-full bg-white p-0.5 shadow"><X size={12} /></button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="flex h-16 w-16 items-center justify-center rounded-xl border-2 border-dashed text-slate-500 disabled:opacity-50">
              {uploading ? <Loader2 className="animate-spin" size={20} /> : <Camera size={20} />}
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => uploadFiles(Array.from(event.target.files || []))} />
        </div>

        <button type="button" onClick={submit} disabled={submitting || uploading} className="mt-6 w-full rounded-2xl bg-slate-900 py-3.5 font-bold text-white disabled:opacity-60">
          {submitting ? "Saving review..." : item.review ? "Update review" : "Submit review"}
        </button>
        <p className="mt-2 text-center text-[11px] text-slate-400">Reviews appear publicly after moderation.</p>
      </section>
    </div>
  );
};

export default ProductReviewModal;
