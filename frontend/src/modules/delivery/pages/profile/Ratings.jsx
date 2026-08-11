import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Star, Loader2, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";
import { deliveryApi } from "../../services/deliveryApi";
import { useAuth } from "@core/context/AuthContext";

const StarBar = ({ label, count, total, color }) => {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-8 text-right font-semibold text-slate-700">{label}★</span>
      <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
      <span className="w-8 text-xs text-slate-500 font-medium">{count}</span>
    </div>
  );
};

const Ratings = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [ratingData, setRatingData] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  useEffect(() => {
    const fetchRating = async () => {
      try {
        const res = await deliveryApi.getMyRating();
        setRatingData(res.data?.result || null);
      } catch (err) {
        console.error("Error fetching rating:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchRating();
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const fetchReviews = async () => {
      try {
        setReviewsLoading(true);
        const res = await deliveryApi.getMyReviews(user.id, { limit: 50 });
        setReviews(res.data?.result?.reviews || []);
      } catch (err) {
        console.error("Error fetching reviews:", err);
      } finally {
        setReviewsLoading(false);
      }
    };
    fetchReviews();
  }, [user?.id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-brand-600" size={32} />
      </div>
    );
  }

  const avg = ratingData?.averageRating || 0;
  const total = ratingData?.totalRatings || 0;
  const dist = ratingData?.starDistribution || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

  const barColors = {
    5: "bg-emerald-500",
    4: "bg-green-400",
    3: "bg-amber-400",
    2: "bg-orange-400",
    1: "bg-red-400",
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white sticky top-0 z-30 px-4 py-3 flex items-center gap-3 border-b border-slate-100 shadow-sm">
        <button
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-full hover:bg-slate-100 transition-colors"
        >
          <ChevronLeft size={24} className="text-slate-800" />
        </button>
        <h1 className="text-lg font-bold text-slate-800">My Ratings</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-5">
        {/* Summary Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100"
        >
          <div className="flex items-center gap-6">
            {/* Big number */}
            <div className="text-center">
              <p className="text-5xl font-black text-slate-900">{avg > 0 ? avg.toFixed(1) : "—"}</p>
              <div className="flex justify-center gap-0.5 mt-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    size={14}
                    className={s <= Math.round(avg) ? "text-amber-400 fill-amber-400" : "text-slate-200"}
                  />
                ))}
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1">{total} rating{total !== 1 ? "s" : ""}</p>
            </div>

            {/* Distribution */}
            <div className="flex-1 space-y-1.5">
              {[5, 4, 3, 2, 1].map((star) => (
                <StarBar
                  key={star}
                  label={star}
                  count={dist[star] || 0}
                  total={total}
                  color={barColors[star]}
                />
              ))}
            </div>
          </div>
        </motion.div>

        {/* Reviews */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100"
        >
          <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
            <MessageSquare size={18} className="text-slate-400" />
            Recent Reviews
          </h3>

          {reviewsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-slate-400" size={24} />
            </div>
          ) : reviews.length === 0 ? (
            <div className="text-center py-8">
              <Star size={40} className="text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No reviews yet</p>
              <p className="text-xs text-slate-400">Your customer reviews will appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reviews.map((r) => (
                <div
                  key={r._id}
                  className="p-3 rounded-2xl bg-slate-50 border border-slate-100"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          size={12}
                          className={s <= r.rating ? "text-amber-400 fill-amber-400" : "text-slate-200"}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {new Date(r.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  {r.review && (
                    <p className="text-sm text-slate-700 leading-relaxed">"{r.review}"</p>
                  )}
                  <p className="text-[10px] text-slate-400 mt-1 font-medium">— {r.customerName}</p>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Ratings;
