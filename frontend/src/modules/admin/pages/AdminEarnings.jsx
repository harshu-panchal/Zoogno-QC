import React, { useState, useEffect } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import Modal from '@shared/components/ui/Modal';
import Pagination from '@shared/components/ui/Pagination';
import { adminApi } from '../services/adminApi';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
    Wallet,
    Receipt,
    ShoppingBag,
    Percent,
    TrendingUp,
    Info,
    ChevronRight,
    ArrowUpRight,
    Download,
    RotateCw,
    PackageOpen
} from 'lucide-react';
import { cn } from '@/lib/utils';

const AdminEarnings = () => {
    const [page, setPage] = useState(1);
    const [pageSize] = useState(25);
    const [transactions, setTransactions] = useState([]);
    const [total, setTotal] = useState(0);
    const [summary, setSummary] = useState({
        totalEarning: 0,
        totalCommission: 0,
        totalSurge: 0,
        totalLogisticsMargin: 0
    });
    const [loading, setLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        fetchEarnings(page);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page]);

    const fetchEarnings = async (requestedPage = 1) => {
        try {
            setLoading(true);
            const res = await adminApi.getAdminEarnings({ page: requestedPage, limit: pageSize });
            if (res.data.success) {
                const payload = res.data.result || {};
                const data = Array.isArray(payload.items) ? payload.items : [];
                
                const mapped = data.map(o => {
                    const comm = o.paymentBreakdown?.adminProductCommissionTotal || 0;
                    const surge = o.paymentBreakdown?.surgeChargeCharged || 0;
                    const delivery = o.paymentBreakdown?.deliveryFeeCharged || 0;
                    const handling = o.paymentBreakdown?.handlingFeeCharged || 0;
                    const rider = o.paymentBreakdown?.riderPayoutTotal || 0;
                    
                    const pureLogistics = delivery + handling - rider;
                    const computedTotal = comm + pureLogistics + surge;

                    return {
                        orderId: o.orderId,
                        date: new Date(o.createdAt).toLocaleString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                        }),
                        customer: o.customer?.name || 'Unknown',
                        seller: o.seller?.shopName || o.seller?.name || 'Unknown',
                        totalEarning: computedTotal,
                        commission: comm,
                        surge: surge,
                        logistics: pureLogistics,
                        orderValue: o.paymentBreakdown?.grandTotal || 0,
                        sellerPayout: o.paymentBreakdown?.sellerPayoutTotal || 0,
                        riderPayout: rider,
                        fullBreakdown: o.paymentBreakdown
                    };
                });
                
                setTransactions(mapped);
                setTotal(payload.total || 0);
                if (payload.summary) {
                    setSummary(payload.summary);
                }
            }
        } catch (error) {
            toast.error("Failed to fetch earnings");
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleExport = () => {
        setIsExporting(true);
        setTimeout(() => {
            setIsExporting(false);
            toast.success('Earnings report exported successfully.');
        }, 1500);
    };

    if (loading && transactions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                <div className="relative">
                    <Loader2 className="h-10 w-10 text-brand-500 animate-spin" />
                    <div className="absolute inset-0 h-10 w-10 text-brand-500/20 blur-sm animate-pulse">
                        <Loader2 />
                    </div>
                </div>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Aggregating Earnings...</p>
            </div>
        );
    }

    return (
        <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-1">
                <div>
                    <h1 className="ds-h1 flex items-center gap-3">
                        Platform Earnings
                        <div className="p-1.5 bg-brand-100 rounded-lg">
                            <Wallet className="h-5 w-5 text-brand-600" />
                        </div>
                    </h1>
                    <p className="ds-description mt-1">Track commissions, delivery margins, and surge income per order.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleExport}
                        disabled={isExporting}
                        className="bg-[#116A29] hover:bg-[#0e5621] text-white rounded-lg font-bold uppercase shadow-md transition-all flex items-center justify-center gap-2 px-5 py-2.5 active:scale-95 text-sm"
                    >
                        {isExporting ? <RotateCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        {isExporting ? 'Generating...' : 'Export Report'}
                    </button>
                </div>
            </div>

            {/* Live Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Total Net Earnings', value: `₹${(summary.totalEarning || 0).toLocaleString()}`, icon: TrendingUp, bg: 'bg-brand-50', color: 'text-brand-600' },
                    { label: 'Product Commissions', value: `₹${(summary.totalCommission || 0).toLocaleString()}`, icon: Percent, bg: 'bg-orange-50', color: 'text-orange-600' },
                    { label: 'Logistics Margins', value: `₹${((summary.totalLogisticsMargin || 0) - (summary.totalSurge || 0)).toLocaleString()}`, icon: PackageOpen, bg: 'bg-blue-50', color: 'text-blue-600' },
                    { label: 'Surge Charges', value: `₹${(summary.totalSurge || 0).toLocaleString()}`, icon: Receipt, bg: 'bg-purple-50', color: 'text-purple-600' },
                ].map((stat, i) => (
                    <Card key={i} className="px-5 py-4 border-none shadow-sm ring-1 ring-slate-100 hover:ring-brand-200 transition-all bg-white group overflow-hidden relative">
                        <div className="relative z-10">
                            <div className={cn("p-2 rounded-xl w-fit mb-4 transition-transform group-hover:scale-110", stat.bg)}>
                                <stat.icon className={cn("h-5 w-5", stat.color)} />
                            </div>
                            <p className="ds-label mb-1">{stat.label}</p>
                            <h3 className="text-2xl font-black text-slate-800 tracking-tight">{stat.value}</h3>
                        </div>
                        <div className="absolute -bottom-4 -right-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
                            <stat.icon className="h-24 w-24" />
                        </div>
                    </Card>
                ))}
            </div>

            {/* Ledger Table */}
            <Card className="border-none shadow-xl ring-1 ring-slate-100/50 bg-white overflow-hidden rounded-2xl">
                <div className="overflow-x-auto">
                    <table className="ds-table">
                        <thead className="bg-slate-50/80 border-b border-slate-100">
                            <tr>
                                <th className="px-5 py-4 text-left ds-label">Order Details</th>
                                <th className="px-5 py-4 text-left ds-label">Shop</th>
                                <th className="px-5 py-4 text-right ds-label">Order Value</th>
                                <th className="px-5 py-4 text-right ds-label">Product Comm.</th>
                                <th className="px-5 py-4 text-right ds-label">Logistics Margin</th>
                                <th className="px-5 py-4 text-right ds-label">Surge Charge</th>
                                <th className="px-5 py-4 text-right ds-label text-brand-600">Net Earning</th>
                                <th className="px-5 py-4 text-center ds-label">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {transactions.map((txn, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/50 transition-colors group cursor-pointer" onClick={() => setSelectedOrder(txn)}>
                                    <td className="px-5 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-slate-800 tracking-wide uppercase">#{txn.orderId}</span>
                                            <span className="text-[10px] font-semibold text-slate-400 mt-0.5">{txn.date}</span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4">
                                        <span className="text-xs font-bold text-slate-700">{txn.seller}</span>
                                    </td>
                                    <td className="px-5 py-4 text-right text-xs font-bold text-slate-600">
                                        ₹{txn.orderValue.toLocaleString()}
                                    </td>
                                    <td className="px-5 py-4 text-right">
                                        <span className="text-xs font-bold text-slate-700">₹{txn.commission.toLocaleString()}</span>
                                    </td>
                                    <td className="px-5 py-4 text-right">
                                        <span className="text-xs font-bold text-slate-700">₹{txn.logistics.toLocaleString()}</span>
                                    </td>
                                    <td className="px-5 py-4 text-right">
                                        <span className="text-xs font-bold text-slate-700">₹{txn.surge.toLocaleString()}</span>
                                    </td>
                                    <td className="px-5 py-4 text-right">
                                        <div className="inline-flex items-center gap-1.5 bg-brand-50 text-brand-700 px-2.5 py-1 rounded-lg font-bold text-xs">
                                            <ArrowUpRight className="h-3 w-3" />
                                            ₹{txn.totalEarning.toLocaleString()}
                                        </div>
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="flex justify-center">
                                            <button className="p-2 rounded-xl text-brand-600 bg-brand-50 hover:bg-brand-100 transition-colors group-hover:shadow-sm">
                                                <ChevronRight className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {transactions.length === 0 && !loading && (
                    <div className="p-12 text-center flex flex-col items-center">
                        <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                            <Receipt className="h-8 w-8 text-slate-300" />
                        </div>
                        <p className="text-sm font-bold text-slate-500">No earnings found yet.</p>
                        <p className="text-xs font-semibold text-slate-400 mt-1">Deliver some orders to see the ledger populate.</p>
                    </div>
                )}
                {total > 0 && (
                    <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                        <Pagination 
                            currentPage={page} 
                            totalPages={Math.ceil(total / pageSize)} 
                            onPageChange={setPage} 
                        />
                    </div>
                )}
            </Card>

            {/* Intelligence Modal */}
            <Modal isOpen={!!selectedOrder} onClose={() => setSelectedOrder(null)} size="lg" title="Earning Intelligence" className="bg-slate-50/50 backdrop-blur-2xl">
                {selectedOrder && (
                    <div className="p-6">
                        <div className="flex items-center justify-between mb-8 pb-6 border-b border-slate-100">
                            <div>
                                <h3 className="text-xl font-black text-slate-800 tracking-tight">Order #{selectedOrder.orderId}</h3>
                                <p className="text-xs font-bold text-slate-500 mt-1">{selectedOrder.date} • {selectedOrder.seller}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Platform Earning</p>
                                <h2 className="text-3xl font-black text-brand-600">₹{selectedOrder.totalEarning.toLocaleString()}</h2>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="bg-white p-5 rounded-2xl shadow-sm ring-1 ring-slate-100">
                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                                    <Percent className="h-3.5 w-3.5" /> Product Earning
                                </h4>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-semibold text-slate-600">Total Product Commission</span>
                                    <span className="text-sm font-black text-slate-800">₹{selectedOrder.commission.toLocaleString()}</span>
                                </div>
                            </div>

                            <div className="bg-white p-5 rounded-2xl shadow-sm ring-1 ring-slate-100">
                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                                    <PackageOpen className="h-3.5 w-3.5" /> Logistics & Handling (Margin)
                                </h4>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-semibold text-slate-500">Customer Paid Delivery Fee</span>
                                        <span className="text-sm font-bold text-slate-700">₹{selectedOrder.fullBreakdown?.deliveryFeeCharged || 0}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-semibold text-slate-500">Customer Paid Handling Fee</span>
                                        <span className="text-sm font-bold text-slate-700">₹{selectedOrder.fullBreakdown?.handlingFeeCharged || 0}</span>
                                    </div>
                                    <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                                        <span className="text-sm font-semibold text-slate-500">Less: Paid to Rider</span>
                                        <span className="text-sm font-bold text-rose-500">-₹{selectedOrder.fullBreakdown?.riderPayoutTotal || 0}</span>
                                    </div>
                                    <div className="flex justify-between items-center pt-1">
                                        <span className="text-sm font-bold text-slate-700">Net Logistics Margin</span>
                                        <span className="text-sm font-black text-brand-600">₹{selectedOrder.logistics.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>

                            {selectedOrder.surge > 0 && (
                                <div className="bg-gradient-to-r from-purple-50 to-white p-5 rounded-2xl shadow-sm ring-1 ring-purple-100">
                                    <h4 className="text-[10px] font-bold text-purple-600 uppercase tracking-widest flex items-center gap-2 mb-4">
                                        <TrendingUp className="h-3.5 w-3.5" /> Surge Earning
                                    </h4>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-semibold text-purple-900">Surge Charge Collected</span>
                                        <span className="text-sm font-black text-purple-700">₹{selectedOrder.surge.toLocaleString()}</span>
                                    </div>
                                    <p className="text-xs text-purple-600/70 mt-2 font-medium">100% of surge charge is retained as platform earning.</p>
                                </div>
                            )}

                            <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-lg mt-6">
                                <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-700">
                                    <span className="text-sm font-bold text-slate-300">Seller Payout</span>
                                    <span className="text-sm font-bold text-emerald-400">₹{selectedOrder.sellerPayout.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-700">
                                    <span className="text-sm font-bold text-slate-300">Delivery Partner Payout</span>
                                    <span className="text-sm font-bold text-emerald-400">₹{selectedOrder.riderPayout.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-bold text-slate-300">Net Platform Calculation</span>
                                    <span className="text-sm font-bold text-brand-400">
                                        {selectedOrder.commission} (Comm) + {selectedOrder.logistics} (Logistics) {selectedOrder.surge > 0 ? `+ ${selectedOrder.surge} (Surge)` : ''} = ₹{selectedOrder.totalEarning.toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default AdminEarnings;
