import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Card from '@shared/components/ui/Card';
import PageHeader from '@shared/components/ui/PageHeader';
import Pagination from '@shared/components/ui/Pagination';
import QRCodeDisplay from '@shared/components/ui/QRCodeDisplay';
import { getBagStatusConfig } from '@shared/utils/qrBagUtils';
import { adminQRBagsApi } from '../services/api/qrBagsApi';
import { toast } from 'sonner';
import {
    Search, Package, Eye, Ban, CheckCircle2, Filter,
    RefreshCw, Loader2, QrCode, TrendingDown, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Removed MOCK_BAGS

const QRBagInventory = () => {
    const [bags, setBags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [selectedBag, setSelectedBag] = useState(null);
    const PAGE_SIZE = 20;

    const fetchBags = async () => {
        setLoading(true);
        try {
            const res = await adminQRBagsApi.getInventory({
                page,
                limit: PAGE_SIZE,
                status: statusFilter !== 'ALL' ? statusFilter : undefined,
                search: search || undefined,
            });
            const payload = res.data?.result || {};
            if (Array.isArray(payload.items)) {
                setBags(payload.items);
                setTotal(payload.total || 0);
            } else {
                throw new Error('no data');
            }
        } catch (err) {
            console.error("Failed to fetch inventory:", err);
            toast.error("Failed to load inventory");
            setBags([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchBags(); }, [page, statusFilter]); // eslint-disable-line
    useEffect(() => {
        const t = setTimeout(() => { setPage(1); fetchBags(); }, 400);
        return () => clearTimeout(t);
    }, [search]); // eslint-disable-line

    // Note: In a real app, stats should be fetched from a dedicated endpoint.
    // For now, we calculate them from the currently fetched bags, or display 0.
    const stats = useMemo(() => ({
        total: total || 0,
        available: bags.filter(b => b.status === 'AVAILABLE' || b.status === 'GENERATED').length,
        inUse: bags.filter(b => ['IN_USE', 'PACKED', 'HUB_SCANNED', 'PICKED_UP', 'IN_TRANSIT'].includes(b.status)).length,
        delivered: bags.filter(b => b.status === 'DELIVERED').length,
        lost: bags.filter(b => b.status === 'LOST').length,
    }), [bags, total]);

    const handleDisable = async (bagId) => {
        try {
            await adminQRBagsApi.disableBag(bagId);
            toast.success('Bag disabled');
            fetchBags();
        } catch {
            toast.error('Failed to disable bag');
        }
    };

    return (
        <div className="space-y-6 pb-16">
            <PageHeader
                title="QR Bag Inventory"
                description="Track every paper bag across its full lifecycle."
                actions={
                    <button onClick={fetchBags} className="flex items-center gap-2 text-xs font-black border border-slate-200 bg-white px-4 py-2 rounded-xl hover:bg-slate-50 transition-colors">
                        <RefreshCw size={13} />REFRESH
                    </button>
                }
            />

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                    { label: 'Total Bags', value: stats.total, icon: Package, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                    { label: 'Available', value: stats.available, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: 'In Use', value: stats.inUse, icon: QrCode, color: 'text-amber-600', bg: 'bg-amber-50' },
                    { label: 'Delivered', value: stats.delivered, icon: CheckCircle2, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { label: 'Lost', value: stats.lost, icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50' },
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
                            placeholder="Search bag ID or order ID…"
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                        <Filter size={14} className="text-slate-400 shrink-0" />
                        {['ALL', 'AVAILABLE', 'ASSIGNED', 'IN_USE', 'DELIVERED', 'LOST', 'DISABLED'].map((s) => (
                            <button
                                key={s}
                                onClick={() => { setStatusFilter(s); setPage(1); }}
                                className={cn(
                                    'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase whitespace-nowrap transition-all',
                                    statusFilter === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                )}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-24">
                            <Loader2 size={32} className="text-indigo-500 animate-spin" />
                        </div>
                    ) : bags.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                            <Package size={40} className="mb-3" />
                            <p className="text-sm font-bold">No bags found</p>
                        </div>
                    ) : (
                        <table className="w-full text-left min-w-[640px]">
                            <thead>
                                <tr className="bg-slate-50/60 border-b border-slate-100">
                                    {['Bag ID', 'Status', 'Size', 'Seller', 'Order', 'Last Scan', 'Created', 'Actions'].map((h) => (
                                        <th key={h} className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {bags.map((bag) => {
                                    const cfg = getBagStatusConfig(bag.status);
                                    return (
                                        <tr key={bag._id} className="hover:bg-slate-50/60 group">
                                            <td className="px-4 py-3 font-black text-xs text-slate-900 font-mono">{bag.bagId}</td>
                                            <td className="px-4 py-3">
                                                <span className={cn('px-2.5 py-1 rounded-full text-[10px] font-black uppercase', cfg.badge)}>{cfg.label}</span>
                                            </td>
                                            <td className="px-4 py-3 text-xs font-bold text-slate-700">{bag.size || '—'}</td>
                                            <td className="px-4 py-3 text-xs font-semibold text-slate-600">{bag.seller?.name || <span className="text-slate-300">Unassigned</span>}</td>
                                            <td className="px-4 py-3 text-xs font-semibold text-indigo-600">{bag.orderId || <span className="text-slate-300">—</span>}</td>
                                            <td className="px-4 py-3 text-xs font-medium text-slate-500">
                                                {bag.lastScan ? new Date(bag.lastScan).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : <span className="text-slate-300">Never</span>}
                                            </td>
                                            <td className="px-4 py-3 text-xs font-medium text-slate-500">
                                                {new Date(bag.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => setSelectedBag(bag)} className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100" title="View QR">
                                                        <Eye size={13} />
                                                    </button>
                                                    {bag.status !== 'DISABLED' && (
                                                        <button onClick={() => handleDisable(bag.bagId)} className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100" title="Disable">
                                                            <Ban size={13} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {total > PAGE_SIZE && (
                    <div className="p-4 border-t border-slate-50">
                        <Pagination page={page} totalPages={Math.ceil(total / PAGE_SIZE)} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
                    </div>
                )}
            </Card>

            {/* View QR Modal */}
            <AnimatePresence>
                {selectedBag && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setSelectedBag(null)} />
                        <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="relative z-10 bg-white rounded-3xl p-5 shadow-2xl w-full max-w-sm">
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">QR Code — {selectedBag.bagId}</h3>
                                <button onClick={() => setSelectedBag(null)} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500"><X size={16} /></button>
                            </div>
                            <div className="flex justify-center">
                                <QRCodeDisplay bagId={selectedBag.bagId} size={180} showActions />
                            </div>
                            <div className="mt-6 grid grid-cols-2 gap-3 text-xs">
                                {[
                                    { label: 'Status', value: getBagStatusConfig(selectedBag.status).label },
                                    { label: 'Size', value: selectedBag.size || '—' },
                                    { label: 'Seller', value: selectedBag.seller?.name || 'Unassigned' },
                                    { label: 'Order', value: selectedBag.orderId || '—' },
                                ].map(({ label, value }) => (
                                    <div key={label} className="bg-slate-50 rounded-xl p-3">
                                        <p className="text-slate-500 font-bold uppercase tracking-wider mb-1">{label}</p>
                                        <p className="font-black text-slate-900">{value}</p>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default QRBagInventory;
