import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import Card from '@shared/components/ui/Card';
import PageHeader from '@shared/components/ui/PageHeader';
import Pagination from '@shared/components/ui/Pagination';
import { adminQRBagsApi } from '../services/api/qrBagsApi';
import { toast } from 'sonner';
import {
    Receipt, Loader2, Download, TrendingUp, DollarSign, CreditCard
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_BADGE = {
    pending: 'bg-amber-100 text-amber-700',
    completed: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-red-100 text-red-700',
};

const BagPaymentHistory = () => {
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState('ALL');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const PAGE_SIZE = 15;

    const fetchPayments = async () => {
        setLoading(true);
        try {
            const params = {
                page,
                limit: PAGE_SIZE,
                // If filter is not ALL, pass the paymentStatus
                ...(filter !== 'ALL' && { paymentStatus: filter.toLowerCase() })
            };
            // Fetch requests filtered by paymentStatus
            const res = await adminQRBagsApi.getBagRequests(params);
            const items = res.data?.data || res.data?.result?.items || [];
            
            // If the user meant "ALL", we should only show those that have a payment attempt (not free ones)
            // But for now, we'll just show all requests that have totalAmount > 0
            const validPayments = filter === 'ALL' 
                ? items.filter(r => r.totalAmount > 0)
                : items;

            const mapped = validPayments.map(r => ({
                ...r,
                sellerName: r.sellerId?.shopName || r.sellerId?.name || 'Unknown Seller',
            }));
            
            setPayments(mapped);
            setTotal(res.data?.pagination?.total || 0);
        } catch (err) {
            console.error(err);
            toast.error("Failed to load payment history");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPayments();
    }, [filter, page]);

    // Compute basic summary from the current page/dataset or overall if needed
    // For now we just sum up the current page for simplicity, but ideally this comes from a backend aggregate.
    const summary = {
        total: total,
        completed: payments.filter(b => b.paymentStatus === 'completed').reduce((s, b) => s + (b.totalAmount || 0), 0),
        failed: payments.filter(b => b.paymentStatus === 'failed').length,
    };

    const exportCSV = () => {
        const rows = payments.map(b => [
            b.paymentId || 'N/A',
            b.sellerName,
            b.size,
            b.quantity,
            b.totalAmount,
            b.paymentStatus,
            new Date(b.createdAt).toISOString()
        ].join(','));
        
        const csv = ['Transaction ID,Seller,Size,Quantity,Amount,Status,Date', ...rows].join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bag-payments-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Exported CSV');
    };

    return (
        <div className="space-y-6 pb-16">
            <PageHeader
                title="Bag Payment History"
                description="View the history of payments made by sellers for QR paper bags."
                actions={
                    <button onClick={exportCSV} className="bg-[#116A29] hover:bg-[#0e5621] text-white rounded-lg font-bold uppercase shadow-md transition-all flex items-center justify-center gap-2 px-5 py-2.5 active:scale-95 text-sm">
                        <Download size={13} />EXPORT CSV
                    </button>
                }
            />

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                    { label: 'Total Records', value: summary.total, icon: Receipt, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                    { label: 'Revenue (Page)', value: `₹${summary.completed.toFixed(2)}`, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: 'Failed Payments', value: summary.failed, icon: DollarSign, color: 'text-red-600', bg: 'bg-red-50' },
                ].map(s => (
                    <Card key={s.label} className="border-none shadow-sm ring-1 ring-slate-100 p-4">
                        <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center mb-3', s.bg)}>
                            <s.icon size={18} className={s.color} />
                        </div>
                        <p className="text-xl font-black text-slate-900">{s.value}</p>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-0.5">{s.label}</p>
                    </Card>
                ))}
            </div>

            <Card className="border-none shadow-sm ring-1 ring-slate-100">
                <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
                    {['ALL', 'COMPLETED', 'PENDING', 'FAILED'].map(f => (
                        <button key={f} onClick={() => { setFilter(f); setPage(1); }} className={cn('px-4 py-2 rounded-xl text-xs font-black uppercase whitespace-nowrap transition-all', filter === f ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                            {f}
                        </button>
                    ))}
                </div>

                <div className="overflow-x-auto">
                    {loading ? (
                        <div className="flex justify-center py-20"><Loader2 size={32} className="text-indigo-500 animate-spin" /></div>
                    ) : (
                        <table className="w-full text-left min-w-[680px]">
                            <thead>
                                <tr className="bg-slate-50/60 border-b border-slate-100">
                                    {['Transaction ID', 'Seller', 'Size & Qty', 'Amount', 'Status', 'Date'].map(h => (
                                        <th key={h} className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                <AnimatePresence mode="popLayout">
                                    {payments.map(payment => (
                                        <motion.tr key={payment._id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="hover:bg-slate-50/60 group">
                                            <td className="px-4 py-3 font-black text-xs text-slate-900 font-mono">
                                                {payment.paymentId ? (
                                                    <div className="flex flex-col">
                                                        <span>{payment.paymentId}</span>
                                                        <span className="text-[9px] text-slate-400 font-medium">PhonePe</span>
                                                    </div>
                                                ) : <span className="text-slate-400">-</span>}
                                            </td>
                                            <td className="px-4 py-3 text-xs font-semibold text-slate-700">{payment.sellerName}</td>
                                            <td className="px-4 py-3 text-xs font-black text-slate-600">
                                                {payment.quantity} × {payment.size}
                                            </td>
                                            <td className="px-4 py-3 text-xs font-black text-slate-900">₹{payment.totalAmount}</td>
                                            <td className="px-4 py-3">
                                                <span className={cn('px-2.5 py-1 rounded-full text-[10px] font-black uppercase', STATUS_BADGE[payment.paymentStatus] || 'bg-gray-100 text-gray-600')}>
                                                    {payment.paymentStatus || 'pending'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-xs font-medium text-slate-500">
                                                {new Date(payment.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                        </motion.tr>
                                    ))}
                                </AnimatePresence>
                            </tbody>
                        </table>
                    )}
                    {!loading && payments.length === 0 && (
                        <div className="text-center py-16 text-slate-400">
                            <CreditCard size={36} className="mx-auto mb-3" />
                            <p className="text-sm font-bold">No payment records found</p>
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

export default BagPaymentHistory;
