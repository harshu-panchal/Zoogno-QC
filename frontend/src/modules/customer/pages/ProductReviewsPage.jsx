import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Star, ArrowLeft, MessageSquare, Loader2 } from 'lucide-react';
import { customerApi } from '../services/customerApi';
import { Button } from '@/components/ui/button';
import { useToast } from '@shared/components/ui/Toast';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

const ProductReviewsPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();

    const [reviews, setReviews] = useState([]);
    const [reviewLoading, setReviewLoading] = useState(true);
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);
    const [newReview, setNewReview] = useState({ rating: 5, comment: '' });
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
                    setReviews(reviewsRes.data.results);
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

    const handleReviewSubmit = async (e) => {
        e.preventDefault();
        if (!newReview.comment.trim()) {
            showToast('Please write a review comment', 'error');
            return;
        }

        try {
            setIsSubmittingReview(true);
            const res = await customerApi.submitReview({ productId: id, ...newReview });
            if (res.data.success) {
                showToast('Review submitted successfully. It will be visible after approval.', 'success');
                setNewReview({ rating: 5, comment: '' });
            }
        } catch (error) {
            showToast(error?.response?.data?.message || 'Failed to submit review', 'error');
        } finally {
            setIsSubmittingReview(false);
        }
    };

    // Rating Calculations
    const totalRatings = reviews.length;
    const averageRating = totalRatings > 0
        ? (reviews.reduce((acc, r) => acc + r.rating, 0) / totalRatings).toFixed(1)
        : 0;
    const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach(r => {
        if (ratingCounts[r.rating] !== undefined) {
            ratingCounts[r.rating]++;
        }
    });

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

                {/* Review Form */}
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm mb-8">
                    <h4 className="font-black text-slate-800 text-base mb-1">Rate this product</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-5">Reviews are moderated</p>
                    <form onSubmit={handleReviewSubmit} className="space-y-5">
                        <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => setNewReview({ ...newReview, rating: s })}
                                    className={cn(
                                        "h-12 w-12 rounded-xl flex items-center justify-center transition-all shadow-sm",
                                        newReview.rating >= s ? "bg-brand-50 text-primary border border-brand-100" : "bg-slate-50 text-slate-300 border border-slate-100 hover:bg-slate-100"
                                    )}
                                >
                                    <Star size={20} className={cn(newReview.rating >= s && "fill-current")} />
                                </button>
                            ))}
                        </div>
                        <textarea 
                            value={newReview.comment} 
                            onChange={(e) => setNewReview({ ...newReview, comment: e.target.value })} 
                            placeholder="Write your experience with this product..." 
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-medium min-h-[120px] outline-none focus:border-primary focus:bg-white transition-all resize-none shadow-sm" 
                        />
                        <Button type="submit" disabled={isSubmittingReview} className="w-full md:w-auto md:min-w-[200px] h-12 bg-primary hover:opacity-90 text-white font-black rounded-xl text-xs uppercase tracking-widest transition-all shadow-lg shadow-brand-100 ml-auto block">
                            {isSubmittingReview ? "Submitting..." : "Post Review"}
                        </Button>
                    </form>
                </div>

                {/* Reviews List */}
                <div className="space-y-4">
                    <h3 className="font-black text-slate-800 text-lg mb-4">Customer Reviews</h3>
                    {reviewLoading ? (
                        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={32} /></div>
                    ) : reviews.length > 0 ? (
                        reviews.map((r, rIdx) => (
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
                            </div>
                        ))
                    ) : (
                        <div className="py-16 text-center bg-white rounded-3xl border border-dashed border-slate-200">
                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <MessageSquare size={28} className="text-slate-300" />
                            </div>
                            <h4 className="font-black text-slate-800 mb-1">No reviews yet</h4>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Be the first to review this product!</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProductReviewsPage;
