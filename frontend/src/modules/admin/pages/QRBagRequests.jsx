import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Card from '@shared/components/ui/Card';
import PageHeader from '@shared/components/ui/PageHeader';
import { getRequestStatusConfig, getPriorityConfig } from '@shared/utils/qrBagUtils';
import { adminQRBagsApi } from '../services/api/qrBagsApi';
import { toast } from 'sonner';
import {
    Package, CheckCircle2, XCircle, Loader2, Clock, MessageSquare, X, Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Removed MOCKS

const QRBagRequests = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState('PENDING_APPROVAL');
    const [rejectModal, setRejectModal] = useState(null);
    const [dispatchModal, setDispatchModal] = useState(null);
    const [rejectReason, setRejectReason] = useState('');
    const [trackingDetails, setTrackingDetails] = useState('');
    const [processingId, setProcessingId] = useState(null);

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const res = await adminQRBagsApi.getBagRequests();
            const items = res.data?.data || res.data?.result?.items || [];
            const mapped = items.map(r => ({
                ...r,
                status: r.status.toUpperCase(),
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

    useEffect(() => { fetchRequests(); }, [filter]); // eslint-disable-line

    const filtered = requests.filter(r => filter === 'ALL' || r.status === filter);

    const handleApprove = async (req) => {
        setProcessingId(req._id);
        try {
            await adminQRBagsApi.approveRequest(req._id, { quantity: req.quantity });
            setRequests(prev => prev.map(r => r._id === req._id ? { ...r, status: req.totalAmount === 0 ? 'PAYMENT_COMPLETED' : 'APPROVED_PAYMENT_PENDING' } : r));
            toast.success(`Approved ${req.quantity} bags for ${req.seller.name}`);
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Approval failed');
        } finally { setProcessingId(null); }
    };

    const handleReject = async () => {
        if (!rejectModal) return;
        setProcessingId(rejectModal._id);
        try {
            await adminQRBagsApi.rejectRequest(rejectModal._id, { reason: rejectReason });
            setRequests(prev => prev.map(r => r._id === rejectModal._id ? { ...r, status: 'REJECTED' } : r));
            toast.success('Request rejected');
            setRejectModal(null);
            setRejectReason('');
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Rejection failed');
        } finally { setProcessingId(null); }
    };

    const handleDispatch = async () => {
        if (!dispatchModal) return;
        setProcessingId(dispatchModal._id);
        try {
            await adminQRBagsApi.dispatchRequest(dispatchModal._id, { trackingDetails });
            setRequests(prev => prev.map(r => r._id === dispatchModal._id ? { ...r, status: 'DISPATCHED' } : r));
            toast.success('Bags dispatched successfully');
            setDispatchModal(null);
            setTrackingDetails('');
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Dispatch failed');
        } finally { setProcessingId(null); }
    };

    const handleDeliver = async (req) => {
        setProcessingId(req._id);
        try {
            await adminQRBagsApi.deliverRequest(req._id);
            setRequests(prev => prev.map(r => r._id === req._id ? { ...r, status: 'DELIVERED' } : r));
            toast.success('Marked as delivered');
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to update');
        } finally { setProcessingId(null); }
    };

    const counts = {
        ALL: requests.length,
        PENDING_APPROVAL: requests.filter(r => r.status === 'PENDING_APPROVAL').length,
        APPROVED_PAYMENT_PENDING: requests.filter(r => r.status === 'APPROVED_PAYMENT_PENDING').length,
        PAYMENT_COMPLETED: requests.filter(r => r.status === 'PAYMENT_COMPLETED').length,
        DISPATCHED: requests.filter(r => r.status === 'DISPATCHED').length,
        DELIVERED: requests.filter(r => r.status === 'DELIVERED').length,
        REJECTED: requests.filter(r => r.status === 'REJECTED').length,
    };

    return (
        <div className="space-y-6 pb-16">
            <PageHeader title="Bag Requests" description="Review and action seller requests for QR paper bags." />

            {/* Pending alert */}
            {counts.PENDING_APPROVAL > 0 && (
                <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                    <Clock size={16} className="text-amber-600 shrink-0" />
                    <p className="text-sm font-bold text-amber-800">{counts.PENDING_APPROVAL} pending bag request{counts.PENDING_APPROVAL !== 1 ? 's' : ''} waiting for review</p>
                </div>
            )}

            {/* Filter tabs */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
                <Filter size={14} className="text-slate-400 shrink-0" />
                {['ALL', 'PENDING_APPROVAL', 'APPROVED_PAYMENT_PENDING', 'PAYMENT_COMPLETED', 'DISPATCHED', 'DELIVERED', 'REJECTED'].map(f => (
                    <button key={f} onClick={() => setFilter(f)} className={cn('flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase whitespace-nowrap transition-all', filter === f ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                        {f}
                        {counts[f] > 0 && <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-black', filter === f ? 'bg-white/20' : 'bg-slate-200 text-slate-500')}>{counts[f]}</span>}
                    </button>
                ))}
            </div>

            <Card className="border-none shadow-sm ring-1 ring-slate-100">
                <div className="overflow-x-auto">
                    {loading ? (
                        <div className="flex justify-center py-20"><Loader2 size={32} className="text-indigo-500 animate-spin" /></div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center py-20 text-slate-400">
                            <Package size={40} className="mb-3" />
                            <p className="text-sm font-bold">No requests found</p>
                        </div>
                    ) : (
                        <table className="w-full text-left min-w-[640px]">
                            <thead>
                                <tr className="bg-slate-50/60 border-b border-slate-100">
                                    {['Seller', 'Qty & Size', 'Priority', 'Payment', 'Status', 'Date', 'Actions'].map(h => (
                                        <th key={h} className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                <AnimatePresence mode="popLayout">
                                    {filtered.map(req => {
                                        const sCfg = getRequestStatusConfig(req.status);
                                        const pCfg = getPriorityConfig(req.priority);
                                        return (
                                            <motion.tr key={req._id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="hover:bg-slate-50/60 group">
                                                <td className="px-4 py-3 text-xs font-bold text-slate-900">{req.seller?.name}</td>
                                                <td className="px-4 py-3 text-xs font-black text-slate-900">{req.quantity} × {req.size}</td>
                                                <td className="px-4 py-3"><span className={cn('px-2 py-0.5 rounded-full text-[10px] font-black uppercase', pCfg.badge)}>{pCfg.label}</span></td>
                                                <td className="px-4 py-3">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-xs font-bold text-slate-800">₹{req.totalAmount || 0}</span>
                                                        <span className={cn('text-[9px] font-black uppercase px-2 py-0.5 rounded-full inline-block w-max', req.paymentStatus === 'completed' ? 'bg-emerald-100 text-emerald-700' : req.paymentStatus === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>{req.paymentStatus || 'pending'}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3"><span className={cn('px-2.5 py-1 rounded-full text-[10px] font-black uppercase', sCfg.badge)}>{sCfg.label}</span></td>
                                                <td className="px-4 py-3 text-xs font-medium text-slate-500">{new Date(req.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                                                <td className="px-4 py-3">
                                                    {req.status === 'PENDING_APPROVAL' && (
                                                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button onClick={() => handleApprove(req)} disabled={processingId === req._id} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-black">
                                                                {processingId === req._id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}APPROVE
                                                            </button>
                                                            <button onClick={() => setRejectModal(req)} className="flex items-center gap-1 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-[10px] font-black">
                                                                <XCircle size={11} />REJECT
                                                            </button>
                                                        </div>
                                                    )}
                                                    {req.status === 'PAYMENT_COMPLETED' && (
                                                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button onClick={() => setDispatchModal(req)} disabled={processingId === req._id} className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[10px] font-black">
                                                                <Package size={11} />DISPATCH
                                                            </button>
                                                        </div>
                                                    )}
                                                    {req.status === 'DISPATCHED' && (
                                                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button onClick={() => handleDeliver(req)} disabled={processingId === req._id} className="flex items-center gap-1 px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-[10px] font-black">
                                                                {processingId === req._id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}MARK DELIVERED
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </motion.tr>
                                        );
                                    })}
                                </AnimatePresence>
                            </tbody>
                        </table>
                    )}
                </div>
            </Card>

            {/* Reject Modal */}
            <AnimatePresence>
                {rejectModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setRejectModal(null)} />
                        <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="relative z-10 bg-white rounded-3xl p-4 shadow-2xl w-full max-w-md">
                            <div className="flex items-center justify-between mb-5">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-2xl bg-red-100 flex items-center justify-center">
                                        <MessageSquare size={18} className="text-red-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-slate-900">Reject Request</h3>
                                        <p className="text-xs text-slate-500">{rejectModal.seller?.name} — {rejectModal.quantity} × {rejectModal.size}</p>
                                    </div>
                                </div>
                                <button onClick={() => setRejectModal(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">Reason for Rejection</label>
                                <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Explain why this request is being rejected…" rows={4} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none" />
                            </div>
                            <div className="flex gap-3 mt-5">
                                <button onClick={handleReject} disabled={processingId === rejectModal._id} className="bg-[#116A29] hover:bg-[#0e5621] text-white rounded-lg font-bold uppercase shadow-md transition-all flex items-center justify-center gap-2 px-5 py-2.5 active:scale-95 text-sm">
                                    {processingId === rejectModal._id ? <Loader2 size={15} className="animate-spin" /> : 'REJECT REQUEST'}
                                </button>
                                <button onClick={() => setRejectModal(null)} className="flex-1 bg-slate-100 text-slate-700 rounded-2xl font-black py-3 text-sm hover:bg-slate-200">CANCEL</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Dispatch Modal */}
            <AnimatePresence>
                {dispatchModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setDispatchModal(null)} />
                        <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="relative z-10 bg-white rounded-3xl p-4 shadow-2xl w-full max-w-md">
                            <div className="flex items-center justify-between mb-5">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-2xl bg-blue-100 flex items-center justify-center">
                                        <Package size={18} className="text-blue-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-slate-900">Dispatch Order</h3>
                                        <p className="text-xs text-slate-500">{dispatchModal.seller?.name} — {dispatchModal.quantity} bags</p>
                                    </div>
                                </div>
                                <button onClick={() => setDispatchModal(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">Tracking Details / Courier Notes</label>
                                <textarea value={trackingDetails} onChange={e => setTrackingDetails(e.target.value)} placeholder="e.g. Shipped via DTDC, AWB: 12345678" rows={4} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
                            </div>
                            <div className="flex gap-3 mt-5">
                                <button onClick={handleDispatch} disabled={processingId === dispatchModal._id} className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold uppercase shadow-md transition-all flex items-center justify-center gap-2 px-5 py-2.5 active:scale-95 text-sm">
                                    {processingId === dispatchModal._id ? <Loader2 size={15} className="animate-spin" /> : 'CONFIRM DISPATCH'}
                                </button>
                                <button onClick={() => setDispatchModal(null)} className="flex-1 bg-slate-100 text-slate-700 rounded-2xl font-black py-3 text-sm hover:bg-slate-200">CANCEL</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default QRBagRequests;
