import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '@shared/components/ui/Card';
import { adminDeliveryApi } from '../services/api/deliveryApi';
import { useToast } from '@shared/components/ui/Toast';
import { ChevronLeft, Star, Loader2 } from 'lucide-react';
import Pagination from '@shared/components/ui/Pagination';

const DeliveryBoyRatings = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();
    
    const [loading, setLoading] = useState(true);
    const [deliveryBoy, setDeliveryBoy] = useState(null);
    const [reviews, setReviews] = useState([]);
    
    const [page, setPage] = useState(1);
    const [pageSize] = useState(25);
    const [total, setTotal] = useState(0);

    useEffect(() => {
        fetchRatings(page);
    }, [id, page]);

    const fetchRatings = async (requestedPage) => {
        setLoading(true);
        try {
            const res = await adminDeliveryApi.getDeliveryBoyRatings(id, { page: requestedPage, limit: pageSize });
            if (res.data.success) {
                setDeliveryBoy(res.data.result.deliveryBoy);
                setReviews(res.data.result.reviews || []);
                setTotal(res.data.result.pagination?.total || 0);
            }
        } catch (error) {
            console.error("Fetch Ratings Error:", error);
            showToast("Failed to load ratings", "error");
        } finally {
            setLoading(false);
        }
    };

    if (loading && !deliveryBoy) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-center gap-4">
                <button 
                    onClick={() => navigate('/admin/delivery-boys/active')}
                    className="p-2 bg-white border border-slate-200 rounded-full hover:bg-slate-50 transition-colors"
                >
                    <ChevronLeft className="w-5 h-5 text-slate-600" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        {deliveryBoy?.name || "Delivery Partner"}'s Ratings
                    </h1>
                    <p className="text-slate-500 text-sm mt-1 flex items-center gap-2">
                        Overall Rating: <span className="font-bold text-slate-800 flex items-center gap-1"><Star className="w-4 h-4 text-amber-500 fill-amber-500" /> {deliveryBoy?.averageRating || 0}</span> 
                        • Total Reviews: <span className="font-bold text-slate-800">{deliveryBoy?.totalRatings || 0}</span>
                    </p>
                </div>
            </div>

            <Card>
                {loading && reviews.length > 0 ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
                    </div>
                ) : reviews.length === 0 ? (
                    <div className="text-center py-10 text-slate-500">
                        No ratings found for this delivery partner yet.
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {reviews.map((review) => (
                            <div key={review._id} className="p-6 hover:bg-slate-50 transition-colors">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <h3 className="font-semibold text-slate-900">{review.customerName}</h3>
                                        <p className="text-xs text-slate-500">Order ID: {review.orderId}</p>
                                    </div>
                                    <div className="flex items-center gap-1 bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full text-xs font-bold border border-amber-200">
                                        <Star className="w-3.5 h-3.5 fill-current" /> {review.rating}
                                    </div>
                                </div>
                                
                                {review.review && (
                                    <p className="text-slate-700 text-sm mt-3 bg-white p-3 rounded-lg border border-slate-100 italic">
                                        "{review.review}"
                                    </p>
                                )}
                                
                                <p className="text-xs text-slate-400 mt-3 font-medium">
                                    {new Date(review.createdAt).toLocaleString()}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {total > pageSize && (
                <div className="mt-6 flex justify-center">
                    <Pagination
                        currentPage={page}
                        totalItems={total}
                        pageSize={pageSize}
                        onPageChange={setPage}
                    />
                </div>
            )}
        </div>
    );
};

export default DeliveryBoyRatings;
