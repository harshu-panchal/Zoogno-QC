import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Card from '@shared/components/ui/Card';
import PageHeader from '@shared/components/ui/PageHeader';
import { adminQRBagsApi } from '../services/api/qrBagsApi';
import { toast } from 'sonner';
import {
    TrendingDown, AlertTriangle, Package, Clock, Plus, X, Loader2, Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const MOCK_LOST = [
    { _id: 'l1', bagId: 'BAG-00007', seller: { name: 'Fresh Mart' }, orderId: 'ORD-1042', lastScanAt: new Date(Date.now() - 86400000).toISOString(), markedLostAt: new Date(Date.now() - 3600000).toISOString(), reason: 'Driver did not return bag' },
    { _id: 'l2', bagId: 'BAG-00015', seller: { name: 'QuickBite Grocers' }, orderId: 'ORD-998', lastScanAt: new Date(Date.now() - 172800000).toISOString(), markedLostAt: new Date(Date.now() - 86400000).toISOString(), reason: 'Customer denied receiving' },
];

const QRBagLost = () => {
    const [lostBags, setLostBags] = useState(MOCK_LOST);
    const [search, setSearch] = useState('');
    const [markLostModal, setMarkLostModal] = useState(false);
    const [markForm, setMarkForm] = useState({ bagId: '', reason: '', notes: '' });
    const [submitting, setSubmitting] = useState(false);

    const filtered = lostBags.filter(b =>
        !search || b.bagId.toLowerCase().includes(search.toLowerCase()) || b.orderId?.toLowerCase().includes(search.toLowerCase())
    );

    const handleMarkLost = async () => {
        if (!markForm.bagId.trim()) { toast.error('Bag ID is required'); return; }
        setSubmitting(true);
        try {
            await adminQRBagsApi.markBagLost(markForm);
            setLostBags(prev => [{ _id: Date.now().toString(), bagId: markForm.bagId.trim(), reason: markForm.reason, markedLostAt: new Date().toISOString(), seller: null, orderId: null, lastScanAt: null }, ...prev]);
            toast.success(`Bag ${markForm.bagId} marked as lost`);
            setMarkLostModal(false);
            setMarkForm({ bagId: '', reason: '', notes: '' });
        } catch { toast.error('Failed to mark bag as lost'); } finally { setSubmitting(false); }
    };

    return (
        <div className="space-y-6 pb-16">
            <PageHeader
                title="Lost Bag Management"
                description="Track and manage bags that have gone missing."
                actions={
                    <button onClick={() => setMarkLostModal(true)} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl font-black text-sm transition-colors">
                        <Plus size={15} />MARK BAG LOST
                    </button>
                }
            />

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                    { label: 'Total Lost Bags', value: lostBags.length, icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50' },
                    { label: 'Lost This Month', value: 2, icon: Clock, color: 'text-orange-600', bg: 'bg-orange-50' },
                    { label: 'Avg Loss Rate', value: '0.8%', icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
                ].map(s => (
                    <Card key={s.label} className="border-none shadow-sm ring-1 ring-slate-100 p-4">
                        <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center mb-3', s.bg)}>
                            <s.icon size={18} className={s.color} />
                        </div>
                        <p className="text-2xl font-black text-slate-900">{s.value}</p>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-0.5">{s.label}</p>
                    </Card>
                ))}
            </div>

            <Card className="border-none shadow-sm ring-1 ring-slate-100">
                <div className="p-4 border-b border-slate-100">
                    <div className="relative">
                        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search bag ID or order ID…" className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-300" />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    {filtered.length === 0 ? (
                        <div className="flex flex-col items-center py-20 text-slate-400">
                            <Package size={40} className="mb-3" />
                            <p className="text-sm font-bold">No lost bags found</p>
                        </div>
                    ) : (
                        <table className="w-full text-left min-w-[600px]">
                            <thead>
                                <tr className="bg-slate-50/60 border-b border-slate-100">
                                    {['Bag ID', 'Seller', 'Order', 'Last Scan', 'Marked Lost', 'Reason'].map(h => (
                                        <th key={h} className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filtered.map(bag => (
                                    <tr key={bag._id} className="hover:bg-red-50/30">
                                        <td className="px-4 py-3 font-black text-xs text-red-700 font-mono">{bag.bagId}</td>
                                        <td className="px-4 py-3 text-xs font-semibold text-slate-700">{bag.seller?.name || '—'}</td>
                                        <td className="px-4 py-3 text-xs font-semibold text-indigo-600">{bag.orderId || '—'}</td>
                                        <td className="px-4 py-3 text-xs font-medium text-slate-500">{bag.lastScanAt ? new Date(bag.lastScanAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : <span className="text-slate-300">Never</span>}</td>
                                        <td className="px-4 py-3 text-xs font-medium text-slate-500">{new Date(bag.markedLostAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                                        <td className="px-4 py-3 text-xs font-medium text-slate-600 max-w-[200px] truncate">{bag.reason || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </Card>

            {/* Mark Lost Modal */}
            <AnimatePresence>
                {markLostModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setMarkLostModal(false)} />
                        <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="relative z-10 bg-white rounded-3xl p-4 shadow-2xl w-full max-w-md">
                            <div className="flex items-center justify-between mb-5">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-2xl bg-red-100 flex items-center justify-center"><AlertTriangle size={18} className="text-red-600" /></div>
                                    <h3 className="text-sm font-black text-slate-900">Mark Bag as Lost</h3>
                                </div>
                                <button onClick={() => setMarkLostModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">Bag ID *</label>
                                    <input type="text" value={markForm.bagId} onChange={e => setMarkForm(f => ({ ...f, bagId: e.target.value }))} placeholder="e.g. BAG-00042" className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-300" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">Reason</label>
                                    <input type="text" value={markForm.reason} onChange={e => setMarkForm(f => ({ ...f, reason: e.target.value }))} placeholder="Reason for marking lost…" className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-300" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">Additional Notes</label>
                                    <textarea value={markForm.notes} onChange={e => setMarkForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any additional notes…" rows={3} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none" />
                                </div>
                            </div>
                            <div className="flex gap-3 mt-6">
                                <button onClick={handleMarkLost} disabled={submitting} className="bg-[#116A29] hover:bg-[#0e5621] text-white rounded-lg font-bold uppercase shadow-md transition-all flex items-center justify-center gap-2 px-5 py-2.5 active:scale-95 text-sm">
                                    {submitting ? <Loader2 size={15} className="animate-spin" /> : 'MARK AS LOST'}
                                </button>
                                <button onClick={() => setMarkLostModal(false)} className="flex-1 bg-slate-100 text-slate-700 rounded-2xl font-black py-3 text-sm hover:bg-slate-200">CANCEL</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default QRBagLost;
