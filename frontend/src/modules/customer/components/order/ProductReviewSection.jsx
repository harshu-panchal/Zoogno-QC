import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, Star } from "lucide-react";
import { customerApi } from "../../services/customerApi";
import ProductReviewModal from "./ProductReviewModal";

const ProductReviewSection = ({ orderId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await customerApi.getOrderReviewEligibility(orderId);
      setData(response.data?.result || null);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not load products to review");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="mt-4 flex items-center justify-center rounded-2xl bg-white p-8"><Loader2 className="animate-spin text-emerald-700" /></div>;
  if (error) return (
    <div className="mt-4 rounded-2xl border border-rose-100 bg-white p-5 text-center">
      <p className="text-sm text-slate-600">{error}</p>
      <button onClick={load} className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-emerald-700"><RefreshCw size={15} /> Retry</button>
    </div>
  );
  if (!data?.items?.length) return null;

  return (
    <section className="mt-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-black text-slate-900">Review your products</h2>
          <p className="mt-1 text-xs text-slate-500">Your feedback helps other customers choose.</p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{data.reviewedCount}/{data.totalReviewable}</span>
      </div>
      <div className="mt-4 space-y-3">
        {data.items.map((item) => (
          <div key={item.productId} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3">
            {item.image ? (
              <img src={item.image} alt="" className="h-14 w-14 rounded-xl bg-slate-50 object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-50 text-slate-300"><Star size={22} /></div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-800">{item.name}</p>
              {item.review ? (
                <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-slate-500"><CheckCircle2 size={13} className="text-emerald-600" /> {item.review.status === "approved" ? "Published" : item.review.status === "rejected" ? "Needs changes" : "Pending approval"}</p>
              ) : <p className="mt-1 text-xs text-slate-400">Not reviewed yet</p>}
            </div>
            <button type="button" onClick={() => setSelected(item)} disabled={!item.eligible} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-700 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400">
              <Star size={14} /> {item.review ? "Edit" : "Review"}
            </button>
          </div>
        ))}
      </div>
      <ProductReviewModal isOpen={Boolean(selected)} onClose={() => setSelected(null)} orderId={data.orderId || orderId} item={selected} onSaved={load} />
    </section>
  );
};

export default ProductReviewSection;
