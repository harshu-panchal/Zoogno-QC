import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Card from '@shared/components/ui/Card';
import PageHeader from '@shared/components/ui/PageHeader';
import { adminBasketsApi } from '../services/api/basketApi';
import { toast } from 'sonner';
import {
    ShoppingBasket, CheckCircle2, XCircle, Loader2, Clock, MessageSquare, X, Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const getRequestStatusConfig = (status) => {
    switch (status?.toLowerCase()) {
        case 'pending': return { label: 'PENDING', badge: 'bg-amber-100 text-amber-700 border-amber-200' };
        case 'approved': return { label: 'APPROVED', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
        case 'rejected': return { label: 'REJECTED', badge: 'bg-rose-100 text-rose-700 border-rose-200' };
        default: return { label: status?.toUpperCase() || 'UNKNOWN', badge: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
};

const BasketRequests = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState('pending');
    const [rejectModal, setRejectModal] = useState(null);
    const [rejectReason, setRejectReason] = useState('');
    const [processingId, setProcessingId] = useState(null);

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const res = await adminBasketsApi.getBasketRequests();
            const items = res.data?.data || res.data?.result?.items || [];
            const mapped = items.map(r => ({
                ...r,
                status: r.status,
                seller: {
                    _id: r.sellerId?._id || r.sellerId,
                    name: r.sellerId?.shopName || r.sellerId?.name || 'Unknown Seller'
                },
                remarks: r.requestNotes || '',
            }));
            setRequests(mapped);
        } catch (err) {
            console.error(err);
            toast.error("Failed to load requests");
        } finally { setLoading(false); }
    };

    useEffect(() => { fetchRequests(); }, [filter]);

    const filtered = requests.filter(r => filter === 'ALL' || r.status.toLowerCase() === filter.toLowerCase());

    const handleApprove = async (req) => {
        setProcessingId(req._id);
        try {
            await adminBasketsApi.approveRequest(req._id, { quantity: req.quantity });
            toast.success(`Approved ${req.quantity} ${req.size} baskets for ${req.seller.name}`);
            fetchRequests();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Approval failed (insufficient unassigned baskets?)');
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (e) => {
        e.preventDefault();
        if (!rejectReason.trim()) return toast.error('Please provide a reason');
        setProcessingId(rejectModal._id);
        try {
            await adminBasketsApi.rejectRequest(rejectModal._id, { reason: rejectReason });
            toast.success('Request rejected');
            setRejectModal(null);
            setRejectReason('');
            fetchRequests();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Rejection failed');
        } finally {
            setProcessingId(null);
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Basket Requests"
                description="Manage bulky order basket requests from sellers"
            />

            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl shadow-sm border border-slate-100">
                    <Filter size={14} className="text-slate-400" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-2">Filter</span>
                    {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f.toLowerCase())}
                            className={cn(
                                'px-3 py-1.5 rounded-xl text-[11px] font-black tracking-wide transition-all',
                                filter.toLowerCase() === f.toLowerCase() ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                            )}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-indigo-400" /></div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 border-dashed">
                    <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <ShoppingBasket size={24} className="text-slate-300" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">No {filter !== 'all' ? filter : ''} requests found</h3>
                    <p className="text-xs text-slate-500 font-medium mt-1">There are no basket requests matching this criteria.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <AnimatePresence>
                        {filtered.map(req => {
                            const sCfg = getRequestStatusConfig(req.status);
                            const isProcessing = processingId === req._id;

                            return (
                                <motion.div key={req._id} layout initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.2 }}>
                                    <Card className="p-5 border-none shadow-sm ring-1 ring-slate-100 hover:shadow-md transition-shadow">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0">
                                                    <ShoppingBasket size={18} className="text-indigo-600" />
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-black text-slate-900">{req.seller.name}</h4>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1"><Clock size={10} />{new Date(req.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <span className={cn('px-2.5 py-1 rounded-xl text-[10px] font-black border', sCfg.badge)}>{sCfg.label}</span>
                                        </div>

                                        <div className="bg-slate-50 rounded-2xl p-4 mb-4">
                                            <div className="flex items-center justify-between mb-3">
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Requested Baskets</p>
                                                    <p className="text-lg font-black text-slate-900">{req.quantity} <span className="text-xs text-slate-500 font-bold ml-1">x {req.size}</span></p>
                                                </div>
                                                {req.status === 'approved' && req.approvedQuantity && (
                                                    <div className="text-right">
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Allocated</p>
                                                        <p className="text-lg font-black text-emerald-600">{req.approvedQuantity}</p>
                                                    </div>
                                                )}
                                            </div>
                                            {req.remarks && (
                                                <div className="flex gap-2 pt-3 border-t border-slate-200/60 mt-3">
                                                    <MessageSquare size={12} className="text-slate-400 shrink-0 mt-0.5" />
                                                    <p className="text-xs font-medium text-slate-600 italic">"{req.remarks}"</p>
                                                </div>
                                            )}
                                            {req.adminNotes && req.status !== 'pending' && (
                                                <div className="flex gap-2 pt-3 border-t border-slate-200/60 mt-3">
                                                    <p className="text-xs font-medium text-amber-600">Admin Note: {req.adminNotes}</p>
                                                </div>
                                            )}
                                        </div>

                                        {req.status === 'pending' && (
                                            <div className="flex items-center gap-2 pt-2">
                                                <button onClick={() => handleApprove(req)} disabled={isProcessing} className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-600 hover:text-white py-2.5 rounded-xl text-xs font-black transition-colors disabled:opacity-50">
                                                    {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <><CheckCircle2 size={14} /> APPROVE</>}
                                                </button>
                                                <button onClick={() => setRejectModal(req)} disabled={isProcessing} className="flex-1 flex items-center justify-center gap-1.5 bg-rose-50 hover:bg-rose-500 text-rose-600 hover:text-white py-2.5 rounded-xl text-xs font-black transition-colors disabled:opacity-50">
                                                    <XCircle size={14} /> REJECT
                                                </button>
                                            </div>
                                        )}
                                    </Card>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}

            {/* Reject Modal */}
            <AnimatePresence>
                {rejectModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setRejectModal(null)} />
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative z-10 bg-white rounded-3xl p-6 shadow-2xl w-full max-w-sm">
                            <div className="flex items-center justify-between mb-5">
                                <div>
                                    <h3 className="text-base font-black text-slate-900">Reject Request</h3>
                                    <p className="text-xs text-slate-500 font-medium">Provide a reason for rejection</p>
                                </div>
                                <button onClick={() => setRejectModal(null)} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500"><X size={16} /></button>
                            </div>
                            <form onSubmit={handleReject}>
                                <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="e.g. You already have too many unused baskets..." className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none h-24 mb-4" autoFocus />
                                <button type="submit" disabled={processingId === rejectModal._id} className="w-full flex items-center justify-center gap-2 bg-rose-500 hover:bg-rose-600 disabled:opacity-60 text-white py-3 rounded-xl text-sm font-black transition-colors">
                                    {processingId === rejectModal._id ? <Loader2 size={16} className="animate-spin" /> : 'CONFIRM REJECTION'}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default BasketRequests;
