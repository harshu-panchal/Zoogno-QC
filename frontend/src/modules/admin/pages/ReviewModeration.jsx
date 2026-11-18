import React, { useState, useEffect } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import Pagination from '@shared/components/ui/Pagination';
import { adminApi } from '../services/adminApi';
import {
    HiOutlineStar,
    HiOutlineTrash,
    HiOutlineShieldCheck,
    HiOutlineExclamationTriangle,
    HiOutlineChatBubbleBottomCenterText,
    HiOutlineHandThumbUp,
    HiOutlineMagnifyingGlass,
    HiOutlineBuildingStorefront
} from 'react-icons/hi2';
import { useToast } from '@shared/components/ui/Toast';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const ReviewModeration = () => {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [reviews, setReviews] = useState([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [total, setTotal] = useState(0);
    const [statusFilter, setStatusFilter] = useState('all');

    useEffect(() => {
        fetchReviews(1, statusFilter);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageSize, statusFilter]);

    const fetchReviews = async (requestedPage = 1, requestedStatus = statusFilter) => {
        try {
            setLoading(true);
            const res = await adminApi.getPendingReviews({ page: requestedPage, limit: pageSize, status: requestedStatus });
            if (res.data.success) {
                const payload = res.data.result || {};
                const data = Array.isArray(payload.items) ? payload.items : (res.data.results || []);
                setReviews(data.map(r => ({
                    ...r,
                    id: r._id,
                    user: r.userId?.name || "Anonymous",
                    item: r.productId?.name || "Deleted Product",
                    itemImage: r.productId?.mainImage || r.productSnapshot?.image,
                    date: new Date(r.createdAt).toLocaleString(),
                    tags: [] // Tags can be empty or logic-based
                })));
                setTotal(typeof payload.total === 'number' ? payload.total : data.length);
                setPage(typeof payload.page === 'number' ? payload.page : requestedPage);
            }
        } catch (error) {
            console.error("Fetch Reviews Error:", error);
            showToast("Failed to load reviews", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (id) => {
        try {
            const res = await adminApi.updateReviewStatus(id, 'approved');
            if (res.data.success) {
                setReviews(reviews.filter(r => r.id !== id));
                fetchReviews(page, statusFilter);
                showToast('Review approved and published', 'success');
            }
        } catch (error) {
            showToast("Failed to approve review", "error");
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to reject and remove this review?')) return;
        try {
            const res = await adminApi.updateReviewStatus(id, 'rejected');
            if (res.data.success) {
                setReviews(reviews.filter(r => r.id !== id));
                fetchReviews(page, statusFilter);
                showToast('Review rejected and removed', 'warning');
            }
        } catch (error) {
            showToast("Failed to remove review", "error");
        }
    };

    return (
        <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-1">
                <div>
                    <h1 className="ds-h1">Moderation Suite</h1>
                    <p className="ds-description mt-0.5">Protect community integrity and store reputations.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl">
                        {[
                            ['all', 'All Reviews'],
                            ['pending', 'Pending'],
                            ['approved', 'Approved'],
                            ['rejected', 'Rejected'],
                        ].map(([value, label]) => (
                            <button
                                key={value}
                                onClick={() => { setStatusFilter(value); setPage(1); }}
                                className={cn(
                                    "px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-colors",
                                    statusFilter === value
                                        ? "bg-white text-slate-900 shadow-sm"
                                        : "text-slate-400 hover:text-slate-600",
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
                {reviews.map((r) => (
                    <Card key={r.id} className="p-3 border-none shadow-sm ring-1 ring-slate-100 bg-white rounded-xl group overflow-hidden relative">
                        {/* Decorative background icon */}
                        <HiOutlineChatBubbleBottomCenterText className="absolute -top-6 -right-6 h-24 w-24 text-slate-50 opacity-[0.03] group-hover:scale-110 transition-transform duration-1000" />

                        <div className="flex flex-col lg:flex-row gap-3 relative z-10">
                            {/* User Info & Rating */}
                            <div className="lg:w-48 shrink-0 space-y-2">
                                <div className="flex items-center gap-3">
                                    <img loading="lazy" src="https://cdn-icons-png.flaticon.com/512/149/149071.png"
                                        alt=""
                                        className="h-8 w-8 rounded-xl bg-slate-50 ring-2 ring-white shadow-sm object-cover"
                                    />
                                    <div>
                                        <h4 className="text-xs font-black text-slate-900">{r.user}</h4>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{r.date}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    {[...Array(5)].map((_, i) => (
                                        <HiOutlineStar
                                            key={i}
                                            className={cn("h-3.5 w-3.5", i < r.rating ? "text-amber-400 fill-amber-400" : "text-slate-200")}
                                        />
                                    ))}
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-slate-500">
                                        <HiOutlineBuildingStorefront className="h-3.5 w-3.5" />
                                        <span className="text-[10px] font-bold line-clamp-1">{r.store}</span>
                                    </div>
                                    <p className="text-[9px] font-black text-primary uppercase tracking-tighter line-clamp-1">Item: {r.item}</p>
                                </div>
                            </div>

                            {/* Comment & Status */}
                            <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    {r.status === 'flagged' && (
                                        <Badge variant="danger" className="text-[8px] font-black uppercase tracking-widest flex items-center gap-1 py-0">
                                            <HiOutlineExclamationTriangle className="h-3 w-3" />
                                            FLAGGED
                                        </Badge>
                                    )}
                                    {r.tags && r.tags.map((tag, i) => (
                                        <Badge key={i} variant="secondary" className="text-[8px] font-bold text-slate-400 bg-slate-50 border-none px-2 py-0.5">{tag}</Badge>
                                    ))}
                                    {r.verifiedPurchase && (
                                        <Badge variant="secondary" className="text-[8px] font-bold text-emerald-700 bg-emerald-50 border-none px-2 py-0.5">VERIFIED PURCHASE</Badge>
                                    )}
                                </div>
                                <blockquote className="text-xs font-medium text-slate-700 leading-relaxed bg-slate-50/50 p-3 rounded-xl italic border-l-4 border-slate-100">
                                    "{r.comment}"
                                </blockquote>
                                {r.images?.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {r.images.map((image) => <a key={image} href={image} target="_blank" rel="noreferrer"><img src={image} alt="Review evidence" className="h-14 w-14 rounded-lg border object-cover" /></a>)}
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="lg:w-36 flex lg:flex-col items-center justify-center gap-2">
                                {r.status !== 'approved' && (
                                    <button
                                        onClick={() => handleApprove(r.id)}
                                        className="flex-1 w-full flex items-center justify-center gap-2 py-2 bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-md shadow-emerald-200 hover:bg-emerald-600 transition-all active:scale-95"
                                    >
                                        <HiOutlineShieldCheck className="h-3.5 w-3.5" />
                                        APPROVE
                                    </button>
                                )}
                                <button
                                    onClick={() => handleDelete(r.id)}
                                    className="flex-1 w-full flex items-center justify-center gap-2 py-2 bg-white text-rose-500 ring-1 ring-rose-100 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-rose-50 transition-all active:scale-95"
                                >
                                    <HiOutlineTrash className="h-3.5 w-3.5" />
                                    REMOVE
                                </button>
                            </div>
                        </div>
                    </Card>
                ))}
                {!loading && reviews.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-6 py-14 text-center">
                        <HiOutlineChatBubbleBottomCenterText className="mx-auto h-10 w-10 text-slate-300" />
                        <h3 className="mt-3 text-sm font-black text-slate-800">No {statusFilter === 'all' ? '' : statusFilter} reviews found</h3>
                        <p className="mt-1 text-xs font-medium text-slate-400">
                            Customer product reviews will appear here after they are submitted from delivered orders.
                        </p>
                    </div>
                )}
            </div>
            <div className="mt-6 flex justify-center">
                <Pagination
                    page={page}
                    totalPages={Math.ceil(total / pageSize) || 1}
                    total={total}
                    pageSize={pageSize}
                    onPageChange={(p) => fetchReviews(p, statusFilter)}
                    onPageSizeChange={(newSize) => {
                        setPageSize(newSize);
                        setPage(1);
                    }}
                    loading={loading}
                />
            </div>

        </div>
    );
};

export default ReviewModeration;
