import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Package, ChevronRight, Clock, CheckCircle, ChevronLeft, Loader2 } from 'lucide-react';
import LottieLoader from '@/shared/components/ui/LottieLoader';
import { customerApi } from '../services/customerApi';
import { getOrderStatusLabel, getLegacyStatusFromOrder } from '@/shared/utils/orderStatus';
import { applyCloudinaryTransform } from '@/core/utils/imageUtils';

const ORDERS_PAGE_SIZE = 20;

const OrdersPage = () => {
    const navigate = useNavigate();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const fetchOrders = useCallback(async (pageNum, { append }) => {
        if (append) setLoadingMore(true);
        try {
            const response = await customerApi.getMyOrders({ page: pageNum, limit: ORDERS_PAGE_SIZE });
            // Backend uses handleResponse():
            // - arrays => { results: [...] }
            // - objects => { result: { items: [...], page, totalPages } }
            const payload = response?.data;
            const result = payload?.result;
            const items = result?.items || payload?.results || [];
            setOrders(prev => (append ? [...prev, ...(Array.isArray(items) ? items : [])] : (Array.isArray(items) ? items : [])));
            setTotalPages(Number(result?.totalPages) || 1);
            setPage(pageNum);
        } catch (error) {
            console.error("Failed to fetch orders:", error);
            const apiMessage = error?.response?.data?.message;
            // Orders page is a primary screen; surface failures instead of silently showing empty state.
            if (apiMessage) {
                console.warn("[OrdersPage] API error:", apiMessage);
            }
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, []);

    useEffect(() => {
        fetchOrders(1, { append: false });
    }, [fetchOrders]);

    const sentinelRef = useRef(null);
    useEffect(() => {
        const node = sentinelRef.current;
        if (!node) return undefined;
        if (loading || loadingMore || page >= totalPages) return undefined;

        const observer = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting) {
                fetchOrders(page + 1, { append: true });
            }
        }, { rootMargin: "600px" });

        observer.observe(node);
        return () => observer.disconnect();
    }, [loading, loadingMore, page, totalPages, fetchOrders]);

    if (loading) {
        return <LottieLoader fullScreen />;
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-24">
            <div className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-sm px-4 pt-4 pb-3 border-b border-slate-200/60 mb-4 flex items-center gap-2">
                <button
                    onClick={() => navigate(-1)}
                    className="w-10 h-10 flex items-center justify-center hover:bg-slate-200/70 rounded-full transition-colors -ml-1"
                >
                    <ChevronLeft size={22} className="text-slate-800" />
                </button>
                <h1 className="text-xl font-semibold text-slate-900 tracking-tight">My Orders</h1>
            </div>

            <div className="space-y-4 px-4 pb-2">
                {orders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <Package size={56} className="text-slate-300 mb-4" />
                        <h3 className="text-base font-semibold text-slate-900 mb-1">No orders yet</h3>
                        <p className="text-slate-500 text-sm mb-6 max-w-[260px]">
                            When you place an order, it will appear here so you can track it easily.
                        </p>
                        <Link to="/" className="bg-primary hover:bg-[#0a6d19] text-white px-7 py-2.5 rounded-full font-semibold text-sm shadow-sm transition-colors">
                            Start Shopping
                        </Link>
                    </div>
                ) : (
                    <>
                        {orders.map((order) => {
                        const legacy = getLegacyStatusFromOrder(order);
                        return (
                        <Link
                            to={`/orders/${order.orderId}`}
                            key={order._id}
                            className="block bg-white rounded-2xl px-4 py-3.5 shadow-[0_8px_24px_rgba(15,23,42,0.06)] border border-slate-100/80 active:scale-[0.985] transition-transform cursor-pointer hover:shadow-[0_10px_30px_rgba(15,23,42,0.08)]"
                        >
                            <div className="flex justify-between items-start gap-3 mb-3.5">
                                <div className="flex gap-3.5 flex-1 min-w-0">
                                    <div className="h-12 w-12 rounded-xl overflow-hidden flex items-center justify-center bg-slate-50 ring-1 ring-slate-200/90 shrink-0">
                                        {order.items[0]?.image ? (
                                            <img
                                                src={applyCloudinaryTransform(order.items[0].image, "f_auto,q_auto,w_150")}
                                                alt={order.items[0]?.name || 'Order thumbnail'}
                                                loading="lazy"
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <Package size={22} className="text-slate-400" />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-semibold text-slate-900 text-sm tracking-tight leading-snug">
                                            Order #{order.orderId.slice(-6)}
                                        </h3>
                                        <p className="mt-0.5 text-[11px] text-slate-500 font-medium leading-tight">
                                            {new Date(order.createdAt).toLocaleDateString('en-IN', {
                                                day: 'numeric',
                                                month: 'short',
                                            })}{' '}
                                            <span className="mx-1 text-slate-400">•</span>
                                            {new Date(order.createdAt).toLocaleTimeString('en-IN', {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0 text-right">
                                    <span
                                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                                            legacy === 'delivered'
                                                ? 'bg-brand-50 text-brand-700 border-brand-100'
                                                : legacy === 'cancelled'
                                                    ? 'bg-rose-50 text-rose-700 border-rose-100'
                                                    : 'bg-brand-50 text-brand-700 border-brand-100'
                                        }`}
                                    >
                                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/80">
                                            <CheckCircle
                                                size={9}
                                                className={`${
                                                    legacy === 'delivered'
                                                        ? 'text-brand-600'
                                                        : legacy === 'cancelled'
                                                            ? 'text-rose-500'
                                                            : 'text-brand-500'
                                                }`}
                                            />
                                        </span>
                                        <span>{getOrderStatusLabel(order).toUpperCase()}</span>
                                    </span>
                                    <span className="inline-flex items-center text-[10px] font-medium text-slate-400">
                                        <span className="h-1 w-1 rounded-full bg-slate-300 mr-1" />
                                        Tap to view details
                                    </span>
                                </div>
                            </div>

                            <div className="border-t border-slate-100 pt-3 flex justify-between items-center gap-3">
                                <div className="text-[11px] text-slate-500 font-medium truncate max-w-[230px]">
                                    {order.items.map((i) => i.name).join(', ')}
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[11px] font-medium text-slate-400">Total</span>
                                    <span className="text-sm font-semibold text-slate-900">
                                    ₹{order.pricing.total}
                                    </span>
                                    <ChevronRight size={16} className="text-slate-300" />
                                </div>
                            </div>
                        </Link>
                    );
                    })}

                    {/* Infinite-scroll sentinel — loads older orders on demand instead
                        of requiring them all up front. */}
                    {page < totalPages && (
                        <div ref={sentinelRef} className="w-full flex items-center justify-center py-6">
                            {loadingMore && <Loader2 className="w-6 h-6 text-primary animate-spin" />}
                        </div>
                    )}
                    </>
                )}
            </div>
        </div>
    );
};

export default OrdersPage;
