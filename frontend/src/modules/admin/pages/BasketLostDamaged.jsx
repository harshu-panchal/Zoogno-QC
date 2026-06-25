import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Card from '@shared/components/ui/Card';
import PageHeader from '@shared/components/ui/PageHeader';
import Pagination from '@shared/components/ui/Pagination';
import { getBasketStatusConfig } from '@shared/utils/basketUtils';
import { adminBasketsApi } from '../services/api/basketApi';
import { toast } from 'sonner';
import {
    Search, ShoppingBasket, Filter, RefreshCw, Loader2,
    AlertTriangle, TrendingDown, X, Plus, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const BasketLostDamaged = () => {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('ALL');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [showMarkModal, setShowMarkModal] = useState(false);
    const [markType, setMarkType] = useState('LOST');
    const [markBasketId, setMarkBasketId] = useState('');
    const [markReason, setMarkReason] = useState('');
    const [markNotes, setMarkNotes] = useState('');
    const [marking, setMarking] = useState(false);
    const PAGE_SIZE = 20;

    const fetchEntries = async () => {
        setLoading(true);
        try {
            const res = await adminBasketsApi.getLostDamaged({
                page,
                limit: PAGE_SIZE,
                type: typeFilter !== 'ALL' ? typeFilter : undefined,
                search: search || undefined,
            });
            const payload = res.data?.result || {};
            if (Array.isArray(payload.items)) {
                setEntries(payload.items);
                setTotal(payload.total || 0);
            } else {
                throw new Error('no data');
            }
        } catch (err) {
            console.error("Failed to fetch lost/damaged baskets:", err);
            toast.error("Failed to load lost/damaged baskets");
            setEntries([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchEntries(); }, [page, typeFilter]); // eslint-disable-line
    useEffect(() => {
        const t = setTimeout(() => { setPage(1); fetchEntries(); }, 400);
        return () => clearTimeout(t);
    }, [search]); // eslint-disable-line

    const handleMark = async () => {
        if (!markBasketId.trim()) { toast.error('Enter a basket ID'); return; }
        if (!markReason.trim()) { toast.error('Enter a reason'); return; }

        setMarking(true);
        try {
            if (markType === 'LOST') {
                await adminBasketsApi.markLost({ basketId: markBasketId.trim(), reason: markReason, notes: markNotes });
            } else {
                await adminBasketsApi.markDamaged({ basketId: markBasketId.trim(), reason: markReason, notes: markNotes });
            }
            toast.success(`Basket marked as ${markType.toLowerCase()}`);
            setShowMarkModal(false);
            setMarkBasketId('');
            setMarkReason('');
            setMarkNotes('');
            fetchEntries();
        } catch (err) {
            toast.error(err?.response?.data?.message || `Failed to mark basket as ${markType.toLowerCase()}`);
        } finally {
            setMarking(false);
        }
    };

    const lostCount = entries.filter(e => e.status === 'LOST').length;
    const damagedCount = entries.filter(e => e.status === 'DAMAGED').length;

    return (
        <div className="space-y-6 pb-16">
            <PageHeader
                title="Lost & Damaged Baskets"
                description="Track and manage baskets that are lost or damaged."
                actions={
                    <div className="flex gap-2">
                        <button onClick={() => { setMarkType('LOST'); setShowMarkModal(true); }} className="flex items-center gap-2 text-xs font-black border border-red-200 bg-red-50 text-red-700 px-4 py-2 rounded-xl hover:bg-red-100 transition-colors">
                            <TrendingDown size={13} />MARK LOST
                        </button>
                        <button onClick={() => { setMarkType('DAMAGED'); setShowMarkModal(true); }} className="flex items-center gap-2 text-xs font-black border border-orange-200 bg-orange-50 text-orange-700 px-4 py-2 rounded-xl hover:bg-orange-100 transition-colors">
                            <AlertTriangle size={13} />MARK DAMAGED
                        </button>
                    </div>
                }
            />

            {/* Quick Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <Card className="border-none shadow-sm ring-1 ring-slate-100 p-4">
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center mb-3 bg-slate-50">
                        <ShoppingBasket size={18} className="text-slate-600" />
                    </div>
                    <p className="text-2xl font-black text-slate-900">{total}</p>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-0.5">Total Issues</p>
                </Card>
                <Card className="border-none shadow-sm ring-1 ring-slate-100 p-4">
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center mb-3 bg-red-50">
                        <TrendingDown size={18} className="text-red-600" />
                    </div>
                    <p className="text-2xl font-black text-slate-900">{lostCount}</p>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-0.5">Lost</p>
                </Card>
                <Card className="border-none shadow-sm ring-1 ring-slate-100 p-4">
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center mb-3 bg-orange-50">
                        <AlertTriangle size={18} className="text-orange-600" />
                    </div>
                    <p className="text-2xl font-black text-slate-900">{damagedCount}</p>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-0.5">Damaged</p>
                </Card>
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
                            placeholder="Search basket ID…"
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Filter size={14} className="text-slate-400 shrink-0" />
                        {['ALL', 'LOST', 'DAMAGED'].map((s) => (
                            <button
                                key={s}
                                onClick={() => { setTypeFilter(s); setPage(1); }}
                                className={cn(
                                    'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all',
                                    typeFilter === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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
                    ) : entries.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                            <ShoppingBasket size={40} className="mb-3" />
                            <p className="text-sm font-bold">No lost or damaged baskets</p>
                            <p className="text-xs mt-1">All baskets are in good shape!</p>
                        </div>
                    ) : (
                        <table className="w-full text-left min-w-[640px]">
                            <thead>
                                <tr className="bg-slate-50/60 border-b border-slate-100">
                                    {['Basket ID', 'Status', 'Size', 'Seller', 'Reason', 'Date', 'Notes'].map((h) => (
                                        <th key={h} className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {entries.map((entry) => {
                                    const cfg = getBasketStatusConfig(entry.status);
                                    return (
                                        <tr key={entry._id} className="hover:bg-slate-50/60">
                                            <td className="px-4 py-3 font-black text-xs text-slate-900 font-mono">{entry.basketId}</td>
                                            <td className="px-4 py-3">
                                                <span className={cn('px-2.5 py-1 rounded-full text-[10px] font-black uppercase', cfg.badge)}>{cfg.label}</span>
                                            </td>
                                            <td className="px-4 py-3 text-xs font-bold text-slate-700">{entry.size || '—'}</td>
                                            <td className="px-4 py-3 text-xs font-semibold text-slate-600">{entry.seller?.name || '—'}</td>
                                            <td className="px-4 py-3 text-xs font-medium text-slate-700 max-w-[200px] truncate">{entry.reason || '—'}</td>
                                            <td className="px-4 py-3 text-xs font-medium text-slate-500">
                                                {new Date(entry.markedAt || entry.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                                            </td>
                                            <td className="px-4 py-3 text-xs font-medium text-slate-500 max-w-[150px] truncate">{entry.notes || '—'}</td>
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

            {/* Mark Lost/Damaged Modal */}
            <AnimatePresence>
                {showMarkModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowMarkModal(false)} />
                        <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="relative z-10 bg-white rounded-3xl p-4 shadow-2xl w-full max-w-md">
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                    {markType === 'LOST' ? <TrendingDown size={15} className="text-red-500" /> : <AlertTriangle size={15} className="text-orange-500" />}
                                    Mark Basket as {markType}
                                </h3>
                                <button onClick={() => setShowMarkModal(false)} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500">
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="space-y-4">
                                {/* Type toggle */}
                                <div className="flex gap-2">
                                    {['LOST', 'DAMAGED'].map((type) => (
                                        <button
                                            key={type}
                                            onClick={() => setMarkType(type)}
                                            className={cn(
                                                'flex-1 py-2.5 rounded-xl text-xs font-black uppercase transition-all',
                                                markType === type
                                                    ? type === 'LOST' ? 'bg-red-600 text-white' : 'bg-orange-600 text-white'
                                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                            )}
                                        >
                                            {type}
                                        </button>
                                    ))}
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">Basket ID *</label>
                                    <input
                                        type="text"
                                        value={markBasketId}
                                        onChange={(e) => setMarkBasketId(e.target.value.toUpperCase())}
                                        placeholder="BSK-XXXXXXXX"
                                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-black text-slate-800 font-mono placeholder:text-slate-400 placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">Reason *</label>
                                    <input
                                        type="text"
                                        value={markReason}
                                        onChange={(e) => setMarkReason(e.target.value)}
                                        placeholder={markType === 'LOST' ? 'e.g. Missing after delivery #ORD-1234' : 'e.g. Cracked during transit'}
                                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">Notes (Optional)</label>
                                    <textarea
                                        value={markNotes}
                                        onChange={(e) => setMarkNotes(e.target.value)}
                                        placeholder="Additional details…"
                                        rows={2}
                                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                                    />
                                </div>

                                <button
                                    onClick={handleMark}
                                    disabled={marking}
                                    className={cn(
                                        'w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm text-white transition-colors',
                                        markType === 'LOST'
                                            ? 'bg-red-600 hover:bg-red-700 disabled:opacity-60'
                                            : 'bg-orange-600 hover:bg-orange-700 disabled:opacity-60'
                                    )}
                                >
                                    {marking ? <Loader2 size={15} className="animate-spin" /> : null}
                                    {marking ? 'MARKING…' : `MARK AS ${markType}`}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default BasketLostDamaged;
