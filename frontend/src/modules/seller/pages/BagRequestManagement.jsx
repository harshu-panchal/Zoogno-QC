import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Card from '@shared/components/ui/Card';
import { getRequestStatusConfig, getPriorityConfig } from '@shared/utils/qrBagUtils';
import { sellerApi } from '../services/sellerApi';
import { toast } from 'sonner';
import {
    Package, Plus, X, Clock, CheckCircle2, Loader2, Send, InboxIcon, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const BAG_SIZES = ['Small', 'Medium', 'Large', 'XL'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const MOCK_REQUESTS = [
    { _id: 'r1', quantity: 30, size: 'Medium', priority: 'HIGH', remarks: 'Running out fast', status: 'FULFILLED', createdAt: new Date(Date.now() - 86400000).toISOString(), fulfilledAt: new Date(Date.now() - 43200000).toISOString() },
    { _id: 'r2', quantity: 20, size: 'Small', priority: 'MEDIUM', remarks: '', status: 'PENDING', createdAt: new Date(Date.now() - 3600000).toISOString(), fulfilledAt: null },
    { _id: 'r3', quantity: 50, size: 'Large', priority: 'LOW', remarks: 'Monthly top-up', status: 'REJECTED', createdAt: new Date(Date.now() - 259200000).toISOString(), fulfilledAt: null },
];
const MOCK_INVENTORY = { available: 18, used: 42, total: 60, pendingRequests: 1 };

const BagRequestManagement = () => {
    const [requests, setRequests] = useState(MOCK_REQUESTS);
    const [inventory, setInventory] = useState(MOCK_INVENTORY);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [activeFilter, setActiveFilter] = useState('ALL');
    const [form, setForm] = useState({ quantity: 10, size: 'Medium', priority: 'MEDIUM', remarks: '' });

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await sellerApi.getBagRequests();
            const items = res.data?.result?.items;
            if (Array.isArray(items)) setRequests(items);
        } catch { /* use mock */ } finally { setLoading(false); }
    };
    useEffect(() => { fetchData(); }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (form.quantity < 1) { toast.error('Quantity must be at least 1'); return; }
        setSubmitting(true);
        try {
            await sellerApi.requestBags(form);
            setRequests(prev => [{ _id: Date.now().toString(), ...form, status: 'PENDING', createdAt: new Date().toISOString(), fulfilledAt: null }, ...prev]);
            setInventory(prev => ({ ...prev, pendingRequests: prev.pendingRequests + 1 }));
            toast.success('Bag request submitted!');
            setShowModal(false);
            setForm({ quantity: 10, size: 'Medium', priority: 'MEDIUM', remarks: '' });
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to submit request');
        } finally { setSubmitting(false); }
    };

    const filtered = requests.filter(r => activeFilter === 'ALL' || r.status === activeFilter);

    return (
        <div className="space-y-5 pb-16">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-black text-slate-900">Bag Request Management</h1>
                    <p className="text-sm font-medium text-slate-500 mt-0.5">Request QR paper bags from admin for your orders.</p>
                </div>
                <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-black text-sm shrink-0 transition-colors">
                    <Plus size={15} />REQUEST BAGS
                </button>
            </div>

            {/* Inventory Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: 'Remaining Bags', value: inventory.available, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: 'Used Bags', value: inventory.used, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { label: 'Total Received', value: inventory.total, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                    { label: 'Pending Requests', value: inventory.pendingRequests, color: 'text-amber-600', bg: 'bg-amber-50' },
                ].map(stat => (
                    <Card key={stat.label} className="border-none shadow-sm ring-1 ring-slate-100 p-4">
                        <p className="text-xl font-black text-slate-900">{stat.value}</p>
                        <p className={cn('text-[10px] font-bold uppercase tracking-widest mt-0.5', stat.color)}>{stat.label}</p>
                    </Card>
                ))}
            </div>

            {/* Low stock warning */}
            {inventory.available < 5 && (
                <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                    <AlertCircle size={16} className="text-amber-600 shrink-0" />
                    <p className="text-sm font-bold text-amber-800">Only {inventory.available} bags remaining! Request more soon.</p>
                    <button onClick={() => setShowModal(true)} className="ml-auto text-xs font-black text-amber-700 bg-amber-100 px-3 py-1.5 rounded-lg hover:bg-amber-200">REQUEST NOW</button>
                </div>
            )}

            {/* Filter tabs */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                {['ALL', 'PENDING', 'APPROVED', 'FULFILLED', 'REJECTED'].map(f => {
                    const count = f === 'ALL' ? requests.length : requests.filter(r => r.status === f).length;
                    return (
                        <button key={f} onClick={() => setActiveFilter(f)} className={cn('flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase whitespace-nowrap transition-all', activeFilter === f ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                            {f}
                            {count > 0 && <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-black', activeFilter === f ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500')}>{count}</span>}
                        </button>
                    );
                })}
            </div>

            {/* Requests list */}
            {loading ? (
                <div className="flex items-center justify-center py-20"><Loader2 size={28} className="text-indigo-500 animate-spin" /></div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center py-20 text-slate-400">
                    <InboxIcon size={40} className="mb-3" />
                    <p className="text-sm font-bold">No requests found</p>
                    <button onClick={() => setShowModal(true)} className="mt-4 text-xs font-black text-indigo-600 hover:underline">Submit your first request →</button>
                </div>
            ) : (
                <div className="space-y-3">
                    <AnimatePresence mode="popLayout">
                        {filtered.map(req => {
                            const sCfg = getRequestStatusConfig(req.status);
                            const pCfg = getPriorityConfig(req.priority);
                            return (
                                <motion.div key={req._id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}>
                                    <Card className="border-none shadow-sm ring-1 ring-slate-100 p-4">
                                        <div className="flex items-start gap-3">
                                            <div className="h-10 w-10 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0">
                                                <Package size={18} className="text-indigo-600" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                                    <p className="text-sm font-black text-slate-900">{req.quantity} × {req.size} Bags</p>
                                                    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-black uppercase', sCfg.badge)}>{sCfg.label}</span>
                                                    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-black uppercase', pCfg.badge)}>{pCfg.label}</span>
                                                </div>
                                                <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
                                                    <span className="flex items-center gap-1"><Clock size={11} />{new Date(req.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                                    {req.fulfilledAt && <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 size={11} />Fulfilled {new Date(req.fulfilledAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>}
                                                </div>
                                                {req.remarks && <p className="text-xs font-medium text-slate-500 mt-1.5 italic">"{req.remarks}"</p>}
                                            </div>
                                        </div>
                                    </Card>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}

            {/* Request Modal */}
            <AnimatePresence>
                {showModal && (
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowModal(false)} />
                        <motion.div initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 60 }} className="relative z-10 bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl w-full sm:max-w-md">
                            <div className="flex items-center justify-between mb-5">
                                <div>
                                    <h3 className="text-base font-black text-slate-900">Request New Bags</h3>
                                    <p className="text-xs text-slate-500 font-medium mt-0.5">Admin will review and fulfil your request</p>
                                </div>
                                <button onClick={() => setShowModal(false)} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500"><X size={16} /></button>
                            </div>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">Quantity *</label>
                                    <input type="number" min={1} max={500} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">Bag Size *</label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {BAG_SIZES.map(s => (
                                            <button key={s} type="button" onClick={() => setForm(f => ({ ...f, size: s }))} className={cn('py-2.5 rounded-xl text-xs font-black uppercase border transition-all', form.size === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200')}>
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">Priority *</label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {PRIORITIES.map(p => {
                                            const cfg = getPriorityConfig(p);
                                            return (
                                                <button key={p} type="button" onClick={() => setForm(f => ({ ...f, priority: p }))} className={cn('py-2.5 rounded-xl text-[10px] font-black uppercase border transition-all', form.priority === p ? cn(cfg.badge, 'border-current shadow-sm') : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300')}>
                                                    {p}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">Remarks / Notes</label>
                                    <textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} placeholder="Any additional notes for admin…" rows={3} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
                                </div>
                                <button type="submit" disabled={submitting} className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-2xl font-black py-3.5 text-sm mt-2 transition-colors">
                                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <><Send size={15} />SUBMIT REQUEST</>}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default BagRequestManagement;
