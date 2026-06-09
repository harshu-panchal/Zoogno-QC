import React, { useState, useEffect, useMemo } from 'react';
import Card from '@shared/components/ui/Card';
import Pagination from '@shared/components/ui/Pagination';
import { getBasketStatusConfig } from '@shared/utils/basketUtils';
import { sellerApi } from '../services/sellerApi';
import { toast } from 'sonner';
import {
    Search, ShoppingBasket, CheckCircle2, Filter,
    RefreshCw, Loader2, Package, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const BasketInventorySeller = () => {
    const [baskets, setBaskets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const PAGE_SIZE = 20;

    const fetchBaskets = async () => {
        setLoading(true);
        try {
            const res = await sellerApi.getBasketInventory({
                page,
                limit: PAGE_SIZE,
                status: statusFilter !== 'ALL' ? statusFilter : undefined,
                search: search || undefined,
            });
            const payload = res.data;
            if (Array.isArray(payload?.data)) {
                setBaskets(payload.data);
                setTotal(payload.pagination?.total || 0);
            } else if (Array.isArray(payload?.result?.items)) {
                setBaskets(payload.result.items);
                setTotal(payload.result.total || 0);
            } else {
                throw new Error('no data');
            }
        } catch (err) {
            console.error("Failed to fetch basket inventory:", err);
            toast.error("Failed to load your basket inventory");
            setBaskets([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchBaskets(); }, [page, statusFilter]); // eslint-disable-line
    useEffect(() => {
        const t = setTimeout(() => { setPage(1); fetchBaskets(); }, 400);
        return () => clearTimeout(t);
    }, [search]); // eslint-disable-line

    const stats = useMemo(() => ({
        total: total || 0,
        available: baskets.filter(b => b.status === 'AVAILABLE' || b.status === 'ASSIGNED').length,
        inUse: baskets.filter(b => ['IN_USE', 'PACKED', 'PICKED_UP', 'IN_TRANSIT'].includes(b.status)).length,
        returned: baskets.filter(b => b.status === 'RETURNED' || b.status === 'DELIVERED').length,
    }), [baskets, total]);

    return (
        <div className="space-y-6 pb-16">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-slate-900">My Baskets</h1>
                    <p className="text-sm font-medium text-slate-500 mt-0.5">View baskets assigned to your store for bulky orders.</p>
                </div>
                <button onClick={fetchBaskets} className="flex items-center gap-2 text-xs font-black border border-slate-200 bg-white px-4 py-2 rounded-xl hover:bg-slate-50 transition-colors">
                    <RefreshCw size={13} />REFRESH
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                    { label: 'Total', value: stats.total, icon: ShoppingBasket, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                    { label: 'Available', value: stats.available, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: 'In Use', value: stats.inUse, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
                    { label: 'Returned', value: stats.returned, icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
                ].map((stat) => (
                    <Card key={stat.label} className="border-none shadow-sm ring-1 ring-slate-100 p-4">
                        <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center mb-3', stat.bg)}>
                            <stat.icon size={18} className={stat.color} />
                        </div>
                        <p className="text-2xl font-black text-slate-900">{stat.value}</p>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-0.5">{stat.label}</p>
                    </Card>
                ))}
            </div>

            <Card className="border-none shadow-sm ring-1 ring-slate-100">
                {/* Filter bar */}
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search basket ID or order ID…"
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                        <Filter size={14} className="text-slate-400 shrink-0" />
                        {['ALL', 'AVAILABLE', 'ASSIGNED', 'IN_USE', 'PACKED', 'RETURNED'].map((s) => (
                            <button
                                key={s}
                                onClick={() => { setStatusFilter(s); setPage(1); }}
                                className={cn(
                                    'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase whitespace-nowrap transition-all',
                                    statusFilter === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                )}
                            >
                                {s.replace('_', ' ')}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-24">
                            <Loader2 size={32} className="text-indigo-500 animate-spin" />
                        </div>
                    ) : baskets.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                            <ShoppingBasket size={40} className="mb-3" />
                            <p className="text-sm font-bold">No baskets found</p>
                            <p className="text-xs mt-1">Contact admin to get baskets assigned</p>
                        </div>
                    ) : (
                        <div className="p-4 space-y-3">
                            {baskets.map((basket) => {
                                const cfg = getBasketStatusConfig(basket.status);
                                return (
                                    <div key={basket._id} className="flex items-center justify-between bg-slate-50 hover:bg-slate-100/80 rounded-2xl p-4 border border-slate-100 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                                                <ShoppingBasket size={18} className="text-indigo-500" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-black text-slate-900 font-mono">{basket.basketId}</p>
                                                <p className="text-[10px] font-semibold text-slate-500">{basket.size} · Created {new Date(basket.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {basket.orderId && (
                                                <span className="text-[10px] font-bold text-indigo-600">#{basket.orderId}</span>
                                            )}
                                            <span className={cn('px-2.5 py-1 rounded-full text-[10px] font-black uppercase', cfg.badge)}>{cfg.label}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {total > PAGE_SIZE && (
                    <div className="p-4 border-t border-slate-50">
                        <Pagination page={page} totalPages={Math.ceil(total / PAGE_SIZE)} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
                    </div>
                )}
            </Card>
        </div>
    );
};

export default BasketInventorySeller;
