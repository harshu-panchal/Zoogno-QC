import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import Card from '@shared/components/ui/Card';
import PageHeader from '@shared/components/ui/PageHeader';
import Pagination from '@shared/components/ui/Pagination';
import { adminQRBagsApi } from '../services/api/qrBagsApi';
import { toast } from 'sonner';
import {
    Receipt, CheckCircle2, XCircle, Loader2, Package, Download,
    TrendingUp, Clock, DollarSign,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const MOCK_BILLS = Array.from({ length: 18 }, (_, i) => ({
    _id: `bill_${i}`,
    bagId: `BAG-${String(i + 1).padStart(5, '0')}`,
    orderId: `ORD-${1100 + i}`,
    seller: { name: ['Fresh Mart', 'QuickBite', 'Daily Essentials'][i % 3] },
    size: ['Small', 'Medium', 'Large'][i % 3],
    cost: [2, 3.5, 5][i % 3],
    status: ['PENDING', 'PAID', 'WAIVED'][i % 3],
    deliveredAt: new Date(Date.now() - i * 86400000).toISOString(),
}));

const STATUS_BADGE = {
    PENDING: 'bg-amber-100 text-amber-700',
    PAID: 'bg-emerald-100 text-emerald-700',
    WAIVED: 'bg-slate-100 text-slate-500',
};

const BagBilling = () => {
    const [bills, setBills] = useState(MOCK_BILLS);
    const [filter, setFilter] = useState('ALL');
    const [page, setPage] = useState(1);
    const [processingId, setProcessingId] = useState(null);
    const PAGE_SIZE = 15;

    const summary = {
        total: bills.length,
        pending: bills.filter(b => b.status === 'PENDING').length,
        revenue: bills.filter(b => b.status === 'PAID').reduce((s, b) => s + (b.cost || 0), 0),
        outstanding: bills.filter(b => b.status === 'PENDING').reduce((s, b) => s + (b.cost || 0), 0),
    };

    const filtered = bills.filter(b => filter === 'ALL' || b.status === filter);
    const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const handleMarkPaid = async (id) => {
        setProcessingId(id);
        try {
            await adminQRBagsApi.markBillPaid(id);
            setBills(prev => prev.map(b => b._id === id ? { ...b, status: 'PAID' } : b));
            toast.success('Bill marked as paid');
        } catch { toast.error('Failed to mark as paid'); } finally { setProcessingId(null); }
    };

    const handleWaive = async (id) => {
        setProcessingId(id);
        try {
            await adminQRBagsApi.waiveBill(id);
            setBills(prev => prev.map(b => b._id === id ? { ...b, status: 'WAIVED' } : b));
            toast.success('Bill waived');
        } catch { toast.error('Failed to waive bill'); } finally { setProcessingId(null); }
    };

    const exportCSV = () => {
        const rows = filtered.map(b => [b.bagId, b.orderId, b.seller?.name, b.size, b.cost, b.status, b.deliveredAt].join(','));
        const csv = ['Bag ID,Order ID,Seller,Size,Cost,Status,Delivered At', ...rows].join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bag-billing-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Exported CSV');
    };

    return (
        <div className="space-y-6 pb-16">
            <PageHeader
                title="Bag Billing"
                description="Track and collect fees for QR paper bag usage per delivery."
                actions={
                    <button onClick={exportCSV} className="bg-[#116A29] hover:bg-[#0e5621] text-white rounded-lg font-bold uppercase shadow-md transition-all flex items-center justify-center gap-2 px-5 py-2.5 active:scale-95 text-sm">
                        <Download size={13} />EXPORT CSV
                    </button>
                }
            />

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                    { label: 'Total Bills', value: summary.total, icon: Receipt, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                    { label: 'Pending', value: summary.pending, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
                    { label: 'Revenue Collected', value: `₹${summary.revenue.toFixed(2)}`, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: 'Outstanding', value: `₹${summary.outstanding.toFixed(2)}`, icon: DollarSign, color: 'text-red-600', bg: 'bg-red-50' },
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
                    {['ALL', 'PENDING', 'PAID', 'WAIVED'].map(f => (
                        <button key={f} onClick={() => { setFilter(f); setPage(1); }} className={cn('px-4 py-2 rounded-xl text-xs font-black uppercase whitespace-nowrap transition-all', filter === f ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                            {f}
                        </button>
                    ))}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[680px]">
                        <thead>
                            <tr className="bg-slate-50/60 border-b border-slate-100">
                                {['Bag ID', 'Order', 'Seller', 'Size', 'Cost', 'Status', 'Delivered', 'Actions'].map(h => (
                                    <th key={h} className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            <AnimatePresence mode="popLayout">
                                {paginated.map(bill => (
                                    <motion.tr key={bill._id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="hover:bg-slate-50/60 group">
                                        <td className="px-4 py-3 font-black text-xs text-slate-900 font-mono">{bill.bagId}</td>
                                        <td className="px-4 py-3 text-xs font-semibold text-indigo-600">{bill.orderId}</td>
                                        <td className="px-4 py-3 text-xs font-semibold text-slate-700">{bill.seller?.name}</td>
                                        <td className="px-4 py-3 text-xs font-bold text-slate-600">{bill.size}</td>
                                        <td className="px-4 py-3 text-xs font-black text-slate-900">₹{bill.cost}</td>
                                        <td className="px-4 py-3">
                                            <span className={cn('px-2.5 py-1 rounded-full text-[10px] font-black uppercase', STATUS_BADGE[bill.status] || 'bg-gray-100 text-gray-600')}>{bill.status}</span>
                                        </td>
                                        <td className="px-4 py-3 text-xs font-medium text-slate-500">{new Date(bill.deliveredAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                                        <td className="px-4 py-3">
                                            {bill.status === 'PENDING' && (
                                                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => handleMarkPaid(bill._id)} disabled={processingId === bill._id} className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100" title="Mark Paid">
                                                        {processingId === bill._id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                                                    </button>
                                                    <button onClick={() => handleWaive(bill._id)} disabled={processingId === bill._id} className="p-1.5 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100" title="Waive">
                                                        <XCircle size={12} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                        </tbody>
                    </table>
                    {paginated.length === 0 && (
                        <div className="text-center py-16 text-slate-400">
                            <Receipt size={36} className="mx-auto mb-3" />
                            <p className="text-sm font-bold">No billing records</p>
                        </div>
                    )}
                </div>
                {filtered.length > PAGE_SIZE && (
                    <div className="p-4 border-t border-slate-50">
                        <Pagination page={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
                    </div>
                )}
            </Card>
        </div>
    );
};

export default BagBilling;
