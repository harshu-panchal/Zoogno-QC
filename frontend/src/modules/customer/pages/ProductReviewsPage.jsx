import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Star, ArrowLeft, MessageSquare, Loader2 } from 'lucide-react';
import { customerApi } from '../services/customerApi';
import { useToast } from '@shared/components/ui/Toast';
import { cn } from '@/lib/utils';

const ProductReviewsPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();

    const [reviews, setReviews] = useState([]);
    const [summary, setSummary] = useState({ average: 0, count: 0, breakdown: {} });
    const [reviewLoading, setReviewLoading] = useState(true);
    const [productName, setProductName] = useState('');

    useEffect(() => {
        if (!id) return;

        const loadData = async () => {
            try {
                setReviewLoading(true);
                // First get product name for header
                const productRes = await customerApi.getProductById(id, {});
                if (productRes.data.success) {
                    setProductName(productRes.data.result.name);
                }

                // Then get reviews
                const reviewsRes = await customerApi.getProductReviews(id);
                if (reviewsRes.data.success) {
                    setReviews(reviewsRes.data.result?.items || []);
                    setSummary(reviewsRes.data.result?.summary || { average: 0, count: 0, breakdown: {} });
                }
            } catch (error) {
                console.error("Failed to load reviews:", error);
                showToast("Failed to load reviews", "error");
            } finally {
                setReviewLoading(false);
            }
        };

        loadData();
    }, [id, showToast]);

    const totalRatings = summary.count || 0;
    const averageRating = summary.average || 0;
    const ratingCounts = summary.breakdown || {};

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* Header */}
            <div className="bg-white px-4 py-4 flex items-center gap-4 sticky top-0 z-50 shadow-sm">
                <button
                    onClick={() => navigate(-1)}
                    className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors"
                >
                    <ArrowLeft size={20} />
                </button>
                <div className="flex-1">
                    <h1 className="font-black text-lg text-slate-800 line-clamp-1">{productName || 'Product Reviews'}</h1>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">{totalRatings} Reviews</p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 max-w-4xl mx-auto w-full">
                
                {/* Rating Summary Breakdown */}
                {totalRatings > 0 && (
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm mb-6 flex flex-col md:flex-row gap-8 items-center">
                        <div className="flex flex-col items-center justify-center md:border-r border-slate-100 md:pr-8">
                            <h2 className="text-5xl font-black text-primary">{averageRating}</h2>
                            <div className="flex items-center gap-1 mt-2 text-primary">
                                {[...Array(5)].map((_, i) => (
                                    <Star key={i} size={16} className={cn(i < Math.round(averageRating) ? "fill-current" : "text-slate-200 fill-slate-200")} />
                                ))}
                            </div>
                            <span className="text-xs text-slate-500 font-bold mt-2">{totalRatings} Ratings</span>
                        </div>

                        <div className="flex-1 w-full space-y-3">
                            {[5, 4, 3, 2, 1].map((star) => {
                                const count = ratingCounts[star];
                                const percentage = (count / totalRatings) * 100;
                                return (
                                    <div key={star} className="flex items-center gap-3">
                                        <div className="flex items-center gap-1 w-10 text-xs font-black text-slate-500">
                                            <span>{star}</span>
                                            <Star size={12} className="fill-slate-400 text-slate-400" />
                                        </div>
                                        <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-primary rounded-full transition-all duration-500"
                                                style={{ width: `${percentage}%` }}
                                            />
                                        </div>
                                        <div className="w-8 text-right text-xs font-bold text-slate-400">
                                            {count}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="bg-emerald-50 p-5 rounded-3xl border border-emerald-100 mb-8 flex items-center justify-between gap-4">
                    <div>
                        <h4 className="font-black text-slate-800 text-base">Bought this product?</h4>
                        <p className="mt-1 text-xs text-slate-500">Review it from the delivered order so your purchase can be verified.</p>
                    </div>
                    <button onClick={() => navigate('/orders')} className="shrink-0 rounded-xl bg-emerald-800 px-4 py-2.5 text-xs font-bold text-white">My orders</button>
                </div>

                {/* Reviews List */}
                <div className="space-y-4">
                    <h3 className="font-black text-slate-800 text-lg mb-4">Customer Reviews</h3>
                    {reviewLoading ? (
                        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={32} /></div>
                    ) : reviews.length > 0 ? (
                        reviews.map((r) => (
                            <div key={r._id} className="p-6 rounded-2xl border border-slate-100 bg-white hover:shadow-md transition-all">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-full bg-brand-50 flex items-center justify-center text-sm font-black text-primary border border-brand-100">
                                            {r.userId?.name?.[0] || 'A'}
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-slate-800">{r.userId?.name || 'Anonymous'}</p>
                                            <div className="flex gap-0.5 mt-0.5">
                                                {[...Array(5)].map((_, i) => (
                                                    <Star key={i} size={12} className={cn(i < r.rating ? 'text-primary fill-primary' : 'text-slate-200')} />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-[11px] font-bold text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</span>
                                </div>
                                <p className="text-sm text-slate-600 font-medium leading-relaxed pl-13">{r.comment}</p>
                                {r.images?.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {r.images.map((image) => <img key={image} src={image} alt="Customer review" className="h-20 w-20 rounded-xl border border-slate-100 object-cover" />)}
                                    </div>
                                )}
                            </div>
                        ))
                    ) : (
                        <div className="py-16 text-center bg-white rounded-3xl border border-dashed border-slate-200">
                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <MessageSquare size={28} className="text-slate-300" />
                            </div>
                            <h4 className="font-black text-slate-800 mb-1">No reviews yet</h4>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Delivered customers can review from their orders.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProductReviewsPage;
