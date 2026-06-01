import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Card from '@shared/components/ui/Card';
import QRCodeDisplay from '@shared/components/ui/QRCodeDisplay';
import { getBagStatusConfig } from '@shared/utils/qrBagUtils';
import { sellerApi } from '../services/sellerApi';
import { toast } from 'sonner';
import {
    Package, CheckCircle2, Clock, Loader2, Plus, RefreshCw, ArrowRight, Search, QrCode, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const BagInventory = () => {
    const [bags, setBags] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState('AVAILABLE');
    const [viewingBag, setViewingBag] = useState(null);

    const fetchBags = async () => {
        setLoading(true);
        try {
            const res = await sellerApi.getMyBags();
            // Backend returns data in res.data.data
            const items = res.data?.data || res.data?.result?.items;
            if (Array.isArray(items)) {
                // Map backend statuses to frontend expected format
                const mappedBags = items.map(bag => ({
                    ...bag,
                    frontendStatus: bag.status === 'assigned' ? 'AVAILABLE' : bag.status.toUpperCase(),
                    orderId: bag.currentOrderId || null,
                }));
                setBags(mappedBags);
            }
        } catch (err) { 
            console.error(err);
            toast.error("Failed to load inventory");
        } finally { 
            setLoading(false); 
        }
    };
    useEffect(() => { fetchBags(); }, []);

    const available = bags.filter(b => b.frontendStatus === 'AVAILABLE');
    const used = bags.filter(b => b.frontendStatus !== 'AVAILABLE');

    const displayBags = (activeTab === 'AVAILABLE' ? available : used).filter(b =>
        !search || b.bagId.toLowerCase().includes(search.toLowerCase()) || b.orderId?.toLowerCase().includes(search.toLowerCase())
    );

    const stats = {
        available: available.length,
        inUse: bags.filter(b => ['IN_USE', 'PACKED', 'IN_TRANSIT', 'HUB_SCANNED', 'PICKED_UP'].includes(b.frontendStatus)).length,
        delivered: bags.filter(b => b.frontendStatus === 'DELIVERED').length,
        total: bags.length,
    };

    return (
        <div className="space-y-5 pb-16">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-black text-slate-900">Bag Inventory</h1>
                    <p className="text-sm font-medium text-slate-500 mt-0.5">Your assigned QR paper bags and their usage status.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={fetchBags} className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors">
                        <RefreshCw size={14} />
                    </button>
                    <Link to="/seller/bag-requests">
                        <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-black text-sm transition-colors">
                            <Plus size={15} />REQUEST MORE
                        </button>
                    </Link>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: 'Available', value: stats.available, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: 'In Use', value: stats.inUse, color: 'text-amber-600', bg: 'bg-amber-50' },
                    { label: 'Delivered', value: stats.delivered, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { label: 'Total', value: stats.total, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                ].map(s => (
                    <Card key={s.label} className="border-none shadow-sm ring-1 ring-slate-100 p-4">
                        <p className="text-2xl font-black text-slate-900">{s.value}</p>
                        <p className={cn('text-[10px] font-bold uppercase tracking-widest mt-0.5', s.color)}>{s.label}</p>
                    </Card>
                ))}
            </div>

            {/* Low stock alert */}
            {stats.available < 3 && (
                <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
                    <Package size={16} className="text-red-600 shrink-0" />
                    <p className="text-sm font-bold text-red-800">Critical: Only {stats.available} bag{stats.available !== 1 ? 's' : ''} left!</p>
                    <Link to="/seller/bag-requests" className="ml-auto">
                        <button className="text-xs font-black text-red-700 bg-red-100 px-3 py-1.5 rounded-lg hover:bg-red-200">REQUEST NOW</button>
                    </Link>
                </div>
            )}

            {/* Table */}
            <Card className="border-none shadow-sm ring-1 ring-slate-100">
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
                    <div className="flex gap-2">
                        {['AVAILABLE', 'USED'].map(tab => (
                            <button key={tab} onClick={() => setActiveTab(tab)} className={cn('px-4 py-2 rounded-xl text-xs font-black uppercase transition-all', activeTab === tab ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                                {tab} ({tab === 'AVAILABLE' ? stats.available : used.length})
                            </button>
                        ))}
                    </div>
                    <div className="relative flex-1">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search bag ID or order…" className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20"><Loader2 size={28} className="text-indigo-500 animate-spin" /></div>
                ) : displayBags.length === 0 ? (
                    <div className="flex flex-col items-center py-16 text-slate-400">
                        <Package size={36} className="mb-3" />
                        <p className="text-sm font-bold">No bags in this category</p>
                        <Link to="/seller/bag-requests"><button className="mt-3 text-xs font-black text-indigo-600 hover:underline">Request bags from admin →</button></Link>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left min-w-[480px]">
                            <thead>
                                <tr className="bg-slate-50/60 border-b border-slate-100">
                                    {['Bag ID', 'Status', 'Size', 'Assigned', activeTab === 'AVAILABLE' ? 'Action' : 'Order'].map(h => (
                                        <th key={h} className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                <AnimatePresence mode="popLayout">
                                    {displayBags.map(bag => {
                                        const cfg = getBagStatusConfig(bag.frontendStatus);
                                        return (
                                            <motion.tr key={bag._id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="hover:bg-slate-50/60 group">
                                                <td className="px-4 py-3 font-black text-xs text-slate-900 font-mono flex items-center gap-2">
                                                    <button onClick={() => setViewingBag(bag)} className="text-slate-400 hover:text-indigo-600">
                                                        <QrCode size={13} />
                                                    </button>
                                                    {bag.bagId}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={cn('px-2.5 py-1 rounded-full text-[10px] font-black uppercase', cfg.badge)}>{cfg.label}</span>
                                                </td>
                                                <td className="px-4 py-3 text-xs font-bold text-slate-700">{bag.size || '—'}</td>
                                                <td className="px-4 py-3 text-xs font-medium text-slate-500">{bag.assignedAt ? new Date(bag.assignedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</td>
                                                <td className="px-4 py-3">
                                                    {activeTab === 'AVAILABLE' ? (
                                                        <Link to="/seller/bag-scan">
                                                            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg text-[10px] font-black uppercase transition-colors opacity-0 group-hover:opacity-100">
                                                                USE BAG <ArrowRight size={11} />
                                                            </button>
                                                        </Link>
                                                    ) : (
                                                        <span className="text-xs font-semibold text-indigo-600">{bag.orderId || '—'}</span>
                                                    )}
                                                </td>
                                            </motion.tr>
                                        );
                                    })}
                                </AnimatePresence>
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* QR View modal */}
            <AnimatePresence>
                {viewingBag && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setViewingBag(null)} />
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative z-10 bg-white rounded-3xl p-7 shadow-2xl w-full max-w-xs text-center">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-black text-slate-900">{viewingBag.bagId}</h3>
                                <button onClick={() => setViewingBag(null)} className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200"><X size={14} /></button>
                            </div>
                            <QRCodeDisplay bagId={viewingBag.bagId} size={180} showActions />
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default BagInventory;
