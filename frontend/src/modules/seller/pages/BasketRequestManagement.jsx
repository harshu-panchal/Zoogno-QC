import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Card from '@shared/components/ui/Card';
import { sellerApi } from '../services/sellerApi';
import { toast } from 'sonner';
import {
    Package, Plus, X, Clock, CheckCircle2, Loader2, Send, InboxIcon, AlertCircle, ShoppingBasket
} from 'lucide-react';
import { cn } from '@/lib/utils';

const BASKET_SIZES = ['SMALL', 'MEDIUM', 'LARGE'];

const getRequestStatusConfig = (status) => {
    switch (status?.toLowerCase()) {
        case 'pending': return { label: 'Pending Review', badge: 'bg-amber-100 text-amber-700' };
        case 'approved': return { label: 'Approved', badge: 'bg-emerald-100 text-emerald-700' };
        case 'rejected': return { label: 'Rejected', badge: 'bg-rose-100 text-rose-700' };
        default: return { label: status || 'Unknown', badge: 'bg-slate-100 text-slate-700' };
    }
};

const BasketRequestManagement = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [activeFilter, setActiveFilter] = useState('ALL');
    const [form, setForm] = useState({ quantity: 1, size: 'MEDIUM', notes: '' });

    const fetchData = async () => {
        setLoading(true);
        try {
            const reqRes = await sellerApi.getBasketRequests();
            const reqItems = reqRes.data?.data || [];

            const mappedReqs = reqItems.map(r => ({
                ...r,
                status: r.status,
                remarks: r.requestNotes || '',
                fulfilledAt: r.status === 'approved' ? r.updatedAt : null,
            }));

            setRequests(mappedReqs);
        } catch (error) {
            toast.error('Failed to load requests');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await sellerApi.createBasketRequest({
                quantity: form.quantity,
                size: form.size,
                notes: form.notes
            });
            toast.success('Basket request submitted');
            setShowModal(false);
            setForm({ quantity: 1, size: 'MEDIUM', notes: '' });
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to submit request');
        } finally {
            setSubmitting(false);
        }
    };

    const filters = ['ALL', 'PENDING', 'APPROVED', 'REJECTED'];
    const filtered = requests.filter(r => activeFilter === 'ALL' ? true : r.status.toUpperCase() === activeFilter);

    return (
        <div className="max-w-4xl mx-auto pb-12">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">Basket Requests</h1>
                    <p className="text-sm text-slate-500 font-medium mt-1">Request baskets for your bulky orders</p>
                </div>
                <button onClick={() => setShowModal(true)} className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-2xl font-bold text-sm transition-all shadow-sm shadow-indigo-200">
                    <Plus size={16} strokeWidth={3} /> Request Baskets
                </button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-hide mb-2">
                {filters.map(f => (
                    <button key={f} onClick={() => setActiveFilter(f)} className={cn('px-4 py-2 rounded-xl text-xs font-black tracking-wide whitespace-nowrap transition-all', activeFilter === f ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}>
                        {f}
                    </button>
                ))}
            </div>

            {/* List */}
            {loading ? (
                <div className="flex justify-center p-12"><Loader2 className="animate-spin text-indigo-400" /></div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-16 bg-slate-50 rounded-3xl border border-slate-100 border-dashed">
                    <div className="h-16 w-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                        <InboxIcon size={24} className="text-slate-300" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">No requests found</h3>
                    <p className="text-xs text-slate-500 font-medium mt-1">You haven't made any basket requests yet.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    <AnimatePresence mode="popLayout">
                        {filtered.map(req => {
                            const sCfg = getRequestStatusConfig(req.status);
                            return (
                                <motion.div key={req._id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}>
                                    <Card className="border-none shadow-sm ring-1 ring-slate-100 p-4">
                                        <div className="flex items-start gap-3">
                                            <div className="h-10 w-10 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0">
                                                <ShoppingBasket size={18} className="text-indigo-600" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                                    <p className="text-sm font-black text-slate-900">{req.quantity} x {req.size} Baskets</p>
                                                    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-black uppercase', sCfg.badge)}>{sCfg.label}</span>
                                                    {req.status === 'approved' && req.approvedQuantity && (
                                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-700">Allocated: {req.approvedQuantity}</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
                                                    <span className="flex items-center gap-1"><Clock size={11} />{new Date(req.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                                    {req.fulfilledAt && <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 size={11} />Fulfilled {new Date(req.fulfilledAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>}
                                                </div>
                                                {req.remarks && <p className="text-xs font-medium text-slate-500 mt-1.5 italic">"Note: {req.remarks}"</p>}
                                                {req.adminNotes && <p className="text-xs font-medium text-amber-600 mt-1.5 bg-amber-50 p-2 rounded-lg">Admin: {req.adminNotes}</p>}
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
                                    <h3 className="text-base font-black text-slate-900">Request New Baskets</h3>
                                    <p className="text-xs text-slate-500 font-medium mt-0.5">Admin will review and fulfil your request</p>
                                </div>
                                <button onClick={() => setShowModal(false)} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500"><X size={16} /></button>
                            </div>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">Quantity *</label>
                                    <input type="number" min={1} max={50} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">Basket Size *</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {BASKET_SIZES.map(s => (
                                            <button key={s} type="button" onClick={() => setForm(f => ({ ...f, size: s }))} className={cn('py-2.5 rounded-xl text-xs font-black uppercase border transition-all', form.size === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200')}>
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">Remarks / Notes</label>
                                    <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any additional notes for admin..." rows={3} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
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

export default BasketRequestManagement;
