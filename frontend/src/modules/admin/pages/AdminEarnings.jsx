import React, { useState, useEffect, useMemo } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import Modal from '@shared/components/ui/Modal';
import Pagination from '@shared/components/ui/Pagination';
import { adminApi } from '../services/adminApi';
import axiosInstance from '../../../core/api/axios';
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
    PackageOpen,
    CalendarDays,
    X
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Date helpers for presets ────────────────────────────────────────────
function toLocalISODate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getDatePreset(preset) {
    const now = new Date();
    const today = toLocalISODate(now);

    switch (preset) {
        case 'today':
            return { startDate: today, endDate: today };
        case 'yesterday': {
            const y = new Date(now);
            y.setDate(y.getDate() - 1);
            const d = toLocalISODate(y);
            return { startDate: d, endDate: d };
        }
        case 'this_week': {
            const dayOfWeek = now.getDay();
            const monday = new Date(now);
            monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
            return { startDate: toLocalISODate(monday), endDate: today };
        }
        case 'last_week': {
            const dayOfWeek = now.getDay();
            const thisMonday = new Date(now);
            thisMonday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
            const lastMonday = new Date(thisMonday);
            lastMonday.setDate(thisMonday.getDate() - 7);
            const lastSunday = new Date(thisMonday);
            lastSunday.setDate(thisMonday.getDate() - 1);
            return { startDate: toLocalISODate(lastMonday), endDate: toLocalISODate(lastSunday) };
        }
        case 'this_month': {
            const first = new Date(now.getFullYear(), now.getMonth(), 1);
            return { startDate: toLocalISODate(first), endDate: today };
        }
        case 'last_month': {
            const firstThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastDayPrev = new Date(firstThisMonth);
            lastDayPrev.setDate(lastDayPrev.getDate() - 1);
            const firstPrev = new Date(lastDayPrev.getFullYear(), lastDayPrev.getMonth(), 1);
            return { startDate: toLocalISODate(firstPrev), endDate: toLocalISODate(lastDayPrev) };
        }
        default:
            return { startDate: '', endDate: '' };
    }
}

const DATE_PRESETS = [
    { key: 'all', label: 'All Time' },
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'this_week', label: 'This Week' },
    { key: 'last_week', label: 'Last Week' },
    { key: 'this_month', label: 'This Month' },
    { key: 'last_month', label: 'Last Month' },
    { key: 'custom', label: 'Custom' },
];

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
    const [zones, setZones] = useState([]);
    const [selectedZone, setSelectedZone] = useState('all');

    // Date filter state
    const [datePreset, setDatePreset] = useState('all');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');

    const activeDateRange = useMemo(() => {
        if (datePreset === 'all') return { startDate: '', endDate: '' };
        if (datePreset === 'custom') return { startDate: customStartDate, endDate: customEndDate };
        return getDatePreset(datePreset);
    }, [datePreset, customStartDate, customEndDate]);

    const dateRangeLabel = useMemo(() => {
        if (datePreset === 'all') return '';
        const { startDate, endDate } = activeDateRange;
        if (!startDate && !endDate) return '';
        if (startDate === endDate) return startDate;
        return `${startDate || '...'} → ${endDate || '...'}`;
    }, [datePreset, activeDateRange]);

    useEffect(() => {
        fetchZones();
    }, []);

    const fetchZones = async () => {
        try {
            const res = await axiosInstance.get('/admin/zones');
            const fetched = res.data?.results || res.data?.result || [];
            setZones(Array.isArray(fetched) ? fetched : []);
        } catch (error) {
            console.error("Failed to fetch zones", error);
        }
    };

    useEffect(() => {
        fetchEarnings(page);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, selectedZone, activeDateRange.startDate, activeDateRange.endDate]);

    const fetchEarnings = async (requestedPage = 1) => {
        try {
            setLoading(true);
            const params = { page: requestedPage, limit: pageSize };
            if (selectedZone !== 'all') {
                params.zoneId = selectedZone;
            }
            if (activeDateRange.startDate) {
                params.startDate = activeDateRange.startDate;
            }
            if (activeDateRange.endDate) {
                params.endDate = activeDateRange.endDate;
            }
            const res = await adminApi.getAdminEarnings(params);
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
                    <select
                        value={selectedZone}
                        onChange={(e) => {
                            setSelectedZone(e.target.value);
                            setPage(1);
                        }}
                        className="bg-white border-2 border-slate-200 text-slate-700 text-sm font-bold rounded-lg px-4 py-2 outline-none focus:border-brand-500 transition-all cursor-pointer"
                    >
                        <option value="all">All Zones</option>
                        {zones.map((zone) => (
                            <option key={zone._id || zone.id} value={zone._id || zone.id}>
                                {zone.name}
                            </option>
                        ))}
                    </select>

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

            {/* Date Filter Bar */}
            <div className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm p-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="flex items-center gap-2 text-slate-400 pl-1 shrink-0">
                    <CalendarDays className="h-4 w-4" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Period</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {DATE_PRESETS.map((preset) => (
                        <button
                            key={preset.key}
                            onClick={() => {
                                setDatePreset(preset.key);
                                setPage(1);
                                if (preset.key !== 'custom') {
                                    setCustomStartDate('');
                                    setCustomEndDate('');
                                }
                            }}
                            className={cn(
                                "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all",
                                datePreset === preset.key
                                    ? "bg-slate-900 text-white shadow-md"
                                    : "bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                            )}
                        >
                            {preset.label}
                        </button>
                    ))}
                </div>

                {/* Custom date inputs */}
                {datePreset === 'custom' && (
                    <div className="flex items-center gap-2 ml-auto">
                        <input
                            type="date"
                            value={customStartDate}
                            onChange={(e) => { setCustomStartDate(e.target.value); setPage(1); }}
                            className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-lg px-3 py-1.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-all"
                        />
                        <span className="text-[10px] font-black text-slate-300">TO</span>
                        <input
                            type="date"
                            value={customEndDate}
                            onChange={(e) => { setCustomEndDate(e.target.value); setPage(1); }}
                            className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-lg px-3 py-1.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-all"
                        />
                    </div>
                )}

                {/* Active range label */}
                {datePreset !== 'all' && dateRangeLabel && (
                    <div className="flex items-center gap-2 ml-auto">
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-md">
                            {dateRangeLabel}
                        </span>
                        <button
                            onClick={() => { setDatePreset('all'); setCustomStartDate(''); setCustomEndDate(''); setPage(1); }}
                            className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                            title="Clear date filter"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                )}
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
