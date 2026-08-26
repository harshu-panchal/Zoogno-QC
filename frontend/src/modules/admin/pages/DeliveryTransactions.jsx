import React, { useState, useMemo, useEffect } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import Modal from '@shared/components/ui/Modal';
import Pagination from '@shared/components/ui/Pagination';
import { adminApi } from '../services/adminApi';
import { toast } from 'sonner';
import {
    Receipt,
    Search,
    Filter,
    ArrowUpRight,
    ArrowDownLeft,
    Truck,
    Calendar,
    Download,
    Eye,
    ChevronRight,
    TrendingUp,
    CreditCard,
    Percent,
    ShoppingCart,
    Undo2,
    Wallet,
    Banknote,
    Info,
    RotateCw,
    ExternalLink,
    Landmark,
    Clock,
    CheckCircle2,
    XCircle,
    FileText,
    MapPin,
    Phone,
    User,
    Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const DeliveryTransactions = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterType, setFilterType] = useState('all');
    const [filterPeriod, setFilterPeriod] = useState('all'); // all, today, this_week, last_week, this_month
    const [selectedRider, setSelectedRider] = useState('all');
    const [selectedTxn, setSelectedTxn] = useState(null);
    const [isExporting, setIsExporting] = useState(false);
    const [transactions, setTransactions] = useState([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);

    const [stats, setStats] = useState({
        totalEarnings: 0,
        totalPayouts: 0,
        totalCashCollected: 0,
        totalCashSettled: 0,
        pendingSettlements: 0,
    });

    const getPeriodLabel = (p) => {
        const now = new Date();
        if (p === 'today') {
            return `Today (${now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })})`;
        }
        if (p === 'this_week') {
            const day = now.getDay();
            const diffToMonday = day === 0 ? -6 : 1 - day;
            const monday = new Date(now);
            monday.setDate(now.getDate() + diffToMonday);
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            return `This Week: Mon ${monday.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – Sun ${sunday.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        }
        if (p === 'last_week') {
            const day = now.getDay();
            const diffToMonday = (day === 0 ? -6 : 1 - day) - 7;
            const monday = new Date(now);
            monday.setDate(now.getDate() + diffToMonday);
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            return `Last Week: Mon ${monday.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – Sun ${sunday.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        }
        if (p === 'this_month') {
            return `This Month (${now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })})`;
        }
        return 'All Time History';
    };

    const fetchTransactions = async (requestedPage = 1) => {
        try {
            setLoading(true);
            const params = { page: requestedPage, limit: pageSize };
            if (searchTerm.trim()) params.search = searchTerm.trim();
            if (filterStatus !== 'all') params.status = filterStatus;
            if (filterType !== 'all') params.type = filterType;
            if (filterPeriod !== 'all') params.period = filterPeriod;
            if (selectedRider !== 'all') params.riderId = selectedRider;

            const res = await adminApi.getDeliveryTransactions(params);
            if (res.data.success) {
                const payload = res.data.result || {};
                const data = Array.isArray(payload.items) ? payload.items : (res.data.results || []);
                const mapped = data.map(t => ({
                    id: t.reference || t._id,
                    _id: t._id,
                    orderId: t.order?.orderId || null,
                    order: t.order || null,
                    date: new Date(t.createdAt).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    }),
                    createdAt: t.createdAt,
                    rider: t.user?.name || 'Unknown Rider',
                    riderId: t.user?._id || t.user?.id || 'N/A',
                    phone: t.user?.phone || 'N/A',
                    vehicleType: t.user?.vehicleType || 'Bike',
                    vehicleNumber: t.user?.vehicleNumber || 'N/A',
                    avatar: t.user?.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${t.user?.name || 'rider'}`,
                    type: t.type,
                    amount: t.amount,
                    status: (t.status || 'Pending').toLowerCase(),
                    paymentMethod: t.user?.upiId ? `UPI (${t.user.upiId})` : t.user?.accountNumber ? `A/C: ${t.user.accountNumber}` : 'Wallet',
                    bankDetails: {
                        accountHolder: t.user?.accountHolder || t.user?.name || 'N/A',
                        accountNumber: t.user?.accountNumber || 'N/A',
                        ifsc: t.user?.ifsc || 'N/A',
                        upiId: t.user?.upiId || 'N/A',
                    },
                    orderPricing: t.order?.pricing || null,
                }));
                setTransactions(mapped);
                setTotal(typeof payload.total === 'number' ? payload.total : mapped.length);
                setPage(typeof payload.page === 'number' ? payload.page : requestedPage);
                if (payload.stats) {
                    setStats(payload.stats);
                }
            }
        } catch (error) {
            toast.error("Failed to fetch delivery transactions");
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchTransactions(1);
        }, 500);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageSize, searchTerm, filterStatus, filterType, filterPeriod, selectedRider]);

    const [allRiders, setAllRiders] = useState([]);

    useEffect(() => {
        const fetchRidersList = async () => {
            try {
                const res = await adminApi.getDeliveryPartners({ limit: 200 });
                if (res.data.success) {
                    const list = res.data.result?.items || res.data.results || [];
                    setAllRiders(list.map(r => ({ id: r._id || r.id, name: r.name })));
                }
            } catch (err) {
                console.error("Failed to load riders list:", err);
            }
        };
        fetchRidersList();
    }, []);

    const riders = useMemo(() => {
        if (allRiders.length > 0) return allRiders;
        const map = new Map();
        transactions.forEach(t => {
            if (t.riderId && t.riderId !== 'N/A') {
                map.set(t.riderId, t.rider);
            }
        });
        return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    }, [allRiders, transactions]);

    const filteredTransactions = useMemo(() => {
        return transactions.filter(t => {
            const matchesSearch = !searchTerm.trim() ||
                t.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (t.orderId && t.orderId.toLowerCase().includes(searchTerm.toLowerCase())) ||
                t.rider.toLowerCase().includes(searchTerm.toLowerCase()) ||
                t.phone.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesStatus = filterStatus === 'all' ||
                t.status === filterStatus.toLowerCase() ||
                (filterStatus.toLowerCase() === 'settled' && (t.status === 'settled' || t.status === 'completed')) ||
                (filterStatus.toLowerCase() === 'paid' && (t.status === 'settled' || t.status === 'completed'));

            let matchesType = true;
            if (filterType !== 'all') {
                const lower = t.type.toLowerCase();
                if (filterType === 'earning') {
                    matchesType = lower.includes('earning') || lower.includes('incentive') || lower.includes('bonus');
                } else if (filterType === 'payout') {
                    matchesType = lower.includes('withdrawal') || lower.includes('payout');
                } else if (filterType === 'cash') {
                    matchesType = lower.includes('collection') || lower.includes('cash collection');
                } else if (filterType === 'settlement') {
                    matchesType = lower.includes('settlement') || lower.includes('cash settlement');
                } else {
                    matchesType = lower.includes(filterType.toLowerCase());
                }
            }

            const matchesRider = selectedRider === 'all' ||
                t.riderId === selectedRider ||
                t.rider.toLowerCase() === selectedRider.toLowerCase();

            return matchesSearch && matchesStatus && matchesType && matchesRider;
        });
    }, [transactions, searchTerm, filterStatus, filterType, selectedRider]);

    const handleExport = () => {
        if (!filteredTransactions.length) {
            toast.error("No transactions to export");
            return;
        }
        setIsExporting(true);
        try {
            const headers = ["TXN Reference", "Order ID", "Delivery Partner", "Phone", "Type", "Amount (INR)", "Status", "Bank / UPI", "Date & Time"];
            const rows = filteredTransactions.map(t => [
                `"${t.id}"`,
                `"${t.orderId || 'N/A'}"`,
                `"${t.rider}"`,
                `"${t.phone}"`,
                `"${t.type}"`,
                Math.abs(t.amount || 0),
                `"${t.status.toUpperCase()}"`,
                `"${t.bankDetails.accountNumber !== 'N/A' ? `A/C: ${t.bankDetails.accountNumber} | IFSC: ${t.bankDetails.ifsc}` : t.bankDetails.upiId}"`,
                `"${t.date}"`
            ]);

            const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `Delivery_Transactions_${filterPeriod}_${new Date().toISOString().slice(0, 10)}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success(`Exported ${filteredTransactions.length} transactions`);
        } catch (err) {
            toast.error("Failed to export CSV");
        } finally {
            setIsExporting(false);
        }
    };

    if (loading && !transactions.length) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                <div className="relative">
                    <Loader2 className="h-10 w-10 text-emerald-600 animate-spin" />
                    <div className="absolute inset-0 h-10 w-10 text-emerald-600/20 blur-sm animate-pulse">
                        <Loader2 />
                    </div>
                </div>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Synchronizing Fleet Ledger...</p>
            </div>
        );
    }

    return (
        <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-1">
                <div>
                    <h1 className="ds-h1 flex items-center gap-3">
                        Delivery Transactions
                        <div className="p-1.5 bg-emerald-100 rounded-lg">
                            <Truck className="h-5 w-5 text-emerald-600" />
                        </div>
                    </h1>
                    <p className="ds-description mt-1">Track delivery fees, rider payouts, tips, bonuses, and COD cash settlements.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => fetchTransactions(page)}
                        className="p-2.5 bg-white ring-1 ring-slate-200 text-slate-600 rounded-2xl hover:bg-slate-50 transition-all shadow-sm"
                        title="Refresh"
                    >
                        <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={isExporting}
                        className="bg-[#116A29] hover:bg-[#0e5621] text-white rounded-lg font-bold uppercase shadow-md transition-all flex items-center justify-center gap-2 px-5 py-2.5 active:scale-95 text-sm"
                    >
                        {isExporting ? <RotateCw className="h-4 w-4 animate-spin text-white" /> : <Download className="h-4 w-4" />}
                        {isExporting ? 'Generating Report...' : 'Download Fleet Ledger'}
                    </button>
                </div>
            </div>

            {/* Live Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                    { label: 'Total Earnings', value: `₹${stats.totalEarnings.toLocaleString()}`, icon: Truck, bg: 'bg-emerald-50', color: 'text-emerald-600' },
                    { label: 'Total Paid Out', value: `₹${stats.totalPayouts.toLocaleString()}`, icon: Banknote, bg: 'bg-brand-50', color: 'text-brand-600' },
                    { label: 'COD Cash Collected', value: `₹${stats.totalCashCollected.toLocaleString()}`, icon: Wallet, bg: 'bg-amber-50', color: 'text-amber-600' },
                    { label: 'COD Cash Settled', value: `₹${stats.totalCashSettled.toLocaleString()}`, icon: CheckCircle2, bg: 'bg-blue-50', color: 'text-blue-600' },
                    { label: 'Pending Total', value: `₹${stats.pendingSettlements.toLocaleString()}`, icon: Clock, bg: 'bg-rose-50', color: 'text-rose-600' },
                ].map((stat, i) => (
                    <Card key={i} className="px-5 py-3 border-none shadow-sm ring-1 ring-slate-100 hover:ring-emerald-200 transition-all bg-white group overflow-hidden relative">
                        <div className="relative z-10">
                            <div className={cn("p-2 rounded-xl w-fit mb-4 transition-transform group-hover:scale-110", stat.bg)}>
                                <stat.icon className={cn("h-5 w-5", stat.color)} />
                            </div>
                            <p className="ds-label mb-1">{stat.label}</p>
                            <h3 className="ds-stat-medium">{stat.value}</h3>
                        </div>
                        <div className="absolute -bottom-4 -right-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
                            <stat.icon className="h-24 w-24" />
                        </div>
                    </Card>
                ))}
            </div>

            {/* Period Filter Bar */}
            <Card className="p-4 border-none shadow-sm ring-1 ring-slate-100 bg-white rounded-2xl">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mr-1">
                            <Filter className="h-3.5 w-3.5 text-emerald-600" />
                            Period:
                        </span>
                        <div className="flex flex-wrap bg-slate-100 p-1 rounded-xl gap-1">
                            {[
                                { id: 'all', label: 'All Time' },
                                { id: 'today', label: 'Today' },
                                { id: 'this_week', label: 'This Week (Mon-Sun)' },
                                { id: 'last_week', label: 'Last Week' },
                                { id: 'this_month', label: 'This Month' },
                            ].map((p) => (
                                <button
                                    key={p.id}
                                    onClick={() => setFilterPeriod(p.id)}
                                    className={cn(
                                        "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all",
                                        filterPeriod === p.id
                                            ? "bg-[#116A29] text-white shadow-sm"
                                            : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                                    )}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="px-3 py-1.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-semibold text-slate-600 flex items-center gap-2">
                            <Clock className="h-3.5 w-3.5 text-emerald-600" />
                            <span>{getPeriodLabel(filterPeriod)}</span>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Filter & Search Bar */}
            <Card className="p-4 border-none shadow-xl ring-1 ring-slate-100/50 bg-white/80 backdrop-blur-xl rounded-xl">
                <div className="flex flex-col lg:flex-row gap-4">
                    <div className="flex-1 relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-emerald-600 transition-colors" />
                        <input
                            type="text"
                            placeholder="Filter by Rider, Phone, Order ID, or Txn Reference..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/10 transition-all"
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl ring-1 ring-slate-100">
                            <Filter className="h-3.5 w-3.5 text-slate-400" />
                            <select
                                value={filterType}
                                onChange={(e) => setFilterType(e.target.value)}
                                className="bg-transparent text-[10px] font-bold text-slate-600 uppercase outline-none cursor-pointer"
                            >
                                <option value="all">All Types</option>
                                <option value="earning">Delivery Earnings / Tips</option>
                                <option value="payout">Withdrawals & Payouts</option>
                                <option value="cash">COD Collections</option>
                                <option value="settlement">Cash Settlements</option>
                            </select>
                        </div>

                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl ring-1 ring-slate-100">
                            <Truck className="h-3.5 w-3.5 text-slate-400" />
                            <select
                                value={selectedRider}
                                onChange={(e) => setSelectedRider(e.target.value)}
                                className="bg-transparent text-[10px] font-bold text-slate-600 uppercase outline-none cursor-pointer max-w-[160px]"
                            >
                                <option value="all">All Delivery Partners</option>
                                {riders.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>
                        </div>

                        <div className="flex bg-slate-100 p-1 rounded-xl">
                            {['all', 'settled', 'pending'].map((status) => (
                                <button
                                    key={status}
                                    onClick={() => setFilterStatus(status)}
                                    className={cn(
                                        "px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-tight transition-all",
                                        filterStatus === status ? "bg-white text-emerald-700 shadow-sm" : "text-slate-400 hover:text-slate-600"
                                    )}
                                >
                                    {status}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </Card>

            {/* Master Table Area */}
            <Card className="border-none shadow-2xl ring-1 ring-slate-100 overflow-hidden bg-white rounded-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/80 border-b border-slate-100">
                                <th className="ds-table-header-cell pl-8 py-5">TXN Details</th>
                                <th className="ds-table-header-cell">Delivery Partner</th>
                                <th className="ds-table-header-cell">Type & Order</th>
                                <th className="ds-table-header-cell text-center">Amount</th>
                                <th className="ds-table-header-cell text-center">Payment Info</th>
                                <th className="ds-table-header-cell text-center">Status</th>
                                <th className="ds-table-header-cell text-right pr-8">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredTransactions.map((txn) => {
                                const isPositive = txn.type === 'Delivery Earning' || txn.type === 'Bonus' || txn.type === 'Incentive';
                                const isWithdrawal = txn.type === 'Withdrawal' || txn.type === 'Payout';
                                const isCash = txn.type === 'Cash Collection';

                                return (
                                    <tr key={txn.id} className="group hover:bg-slate-50/40 transition-all">
                                        <td className="px-6 py-5 pl-8">
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "h-10 w-10 rounded-xl flex items-center justify-center shadow-sm",
                                                    isPositive ? "bg-emerald-50 text-emerald-600" : isWithdrawal ? "bg-brand-50 text-brand-600" : isCash ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
                                                )}>
                                                    {isPositive ? <Truck className="h-5 w-5" /> : isWithdrawal ? <ArrowUpRight className="h-5 w-5" /> : isCash ? <Wallet className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                                                </div>
                                                <div>
                                                    <p className="text-xs font-mono font-bold text-slate-900">{txn.id}</p>
                                                    <p className="text-[10px] font-semibold text-slate-400 mt-0.5">{txn.date}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-3">
                                                <img
                                                    src={txn.avatar}
                                                    alt=""
                                                    className="h-8 w-8 rounded-lg object-cover bg-slate-100 ring-1 ring-slate-200"
                                                />
                                                <div>
                                                    <p className="text-xs font-bold text-slate-900">{txn.rider}</p>
                                                    <p className="text-[10px] text-slate-400">{txn.phone} • {txn.vehicleType}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="space-y-1">
                                                <Badge
                                                    variant={isPositive ? 'success' : isWithdrawal ? 'primary' : isCash ? 'warning' : 'secondary'}
                                                    className="text-[9px] font-black px-2 py-0.5 uppercase"
                                                >
                                                    {txn.type}
                                                </Badge>
                                                {txn.orderId && (
                                                    <p className="text-[10px] font-mono text-slate-500">Order #{txn.orderId}</p>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 text-center">
                                            <p className={cn(
                                                "text-sm font-black",
                                                isPositive ? "text-emerald-600" : isWithdrawal ? "text-slate-900" : "text-amber-600"
                                            )}>
                                                {isPositive ? '+' : '-'}₹{Math.abs(txn.amount).toLocaleString()}
                                            </p>
                                        </td>
                                        <td className="px-6 py-5 text-center">
                                            <div className="text-[10px] text-slate-500 font-semibold max-w-[150px] mx-auto truncate">
                                                {txn.bankDetails.accountNumber !== 'N/A' ? (
                                                    <span>A/C: {txn.bankDetails.accountNumber}</span>
                                                ) : txn.bankDetails.upiId !== 'N/A' ? (
                                                    <span>UPI: {txn.bankDetails.upiId}</span>
                                                ) : (
                                                    <span>Wallet</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 text-center">
                                            <Badge
                                                variant={txn.status === 'settled' || txn.status === 'completed' ? 'success' : txn.status === 'pending' ? 'warning' : 'danger'}
                                                className="text-[9px] font-black px-2.5 py-0.5 uppercase"
                                            >
                                                {txn.status}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-5 text-right pr-8">
                                            <button
                                                onClick={() => setSelectedTxn(txn)}
                                                className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:bg-slate-900 hover:text-white transition-all active:scale-90"
                                                title="View Intel"
                                            >
                                                <Eye className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredTransactions.length === 0 && (
                                <tr>
                                    <td colSpan="7" className="px-6 py-16 text-center text-slate-400">
                                        <Truck className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                                        <p className="text-sm font-bold">No delivery transactions found matching the filter criteria.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="px-6 py-3 border-t border-slate-100">
                    <Pagination
                        page={page}
                        totalPages={Math.ceil(total / pageSize) || 1}
                        total={total}
                        pageSize={pageSize}
                        onPageChange={(p) => {
                            setPage(p);
                            fetchTransactions(p);
                        }}
                        onPageSizeChange={(newSize) => {
                            setPageSize(newSize);
                            setPage(1);
                        }}
                        loading={loading}
                    />
                </div>
            </Card>

            {/* Deep Dive Intel Modal */}
            <Modal
                isOpen={!!selectedTxn}
                onClose={() => setSelectedTxn(null)}
                title="Delivery Partner Transaction Intel"
                size="md"
            >
                {selectedTxn && (
                    <div className="ds-section-spacing">
                        {/* Rider Info Card */}
                        <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <img
                                src={selectedTxn.avatar}
                                alt=""
                                className="h-16 w-16 rounded-xl shadow-md ring-2 ring-white object-cover bg-slate-100"
                            />
                            <div>
                                <h3 className="text-xl font-black text-slate-900 tracking-tight">{selectedTxn.rider}</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                    {selectedTxn.phone} • {selectedTxn.vehicleType} ({selectedTxn.vehicleNumber})
                                </p>
                                <div className="flex items-center gap-2 mt-2">
                                    <Badge variant={selectedTxn.status === 'settled' || selectedTxn.status === 'completed' ? 'success' : 'warning'}>
                                        {selectedTxn.status.toUpperCase()}
                                    </Badge>
                                    <span className="text-[10px] font-mono font-bold text-slate-400">{selectedTxn.id}</span>
                                </div>
                            </div>
                        </div>

                        {/* Amount Card */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-slate-900 text-white rounded-xl shadow-lg">
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Transaction Amount</p>
                                <h4 className="text-2xl font-black italic">₹{Math.abs(selectedTxn.amount).toLocaleString()}</h4>
                                <p className="text-[10px] text-emerald-400 font-bold uppercase mt-1">{selectedTxn.type}</p>
                            </div>
                            <div className="p-4 bg-white ring-1 ring-slate-100 rounded-xl shadow-sm">
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Date & Time</p>
                                <h4 className="text-sm font-bold text-slate-900">{selectedTxn.date}</h4>
                                <p className="text-[10px] text-slate-400 mt-1">{selectedTxn.orderId ? `Order #${selectedTxn.orderId}` : 'Direct Account Transaction'}</p>
                            </div>
                        </div>

                        {/* Transfer / Bank Info */}
                        <Card className="p-4 border-none bg-slate-50 ring-1 ring-slate-100 rounded-xl">
                            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 border-b border-slate-200 pb-2">
                                Transfer & Account Details
                            </p>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Account Holder</p>
                                    <p className="font-bold text-slate-900">{selectedTxn.bankDetails.accountHolder}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Account Number</p>
                                    <p className="font-bold text-slate-900">{selectedTxn.bankDetails.accountNumber}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">IFSC Code</p>
                                    <p className="font-bold text-slate-900">{selectedTxn.bankDetails.ifsc}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">UPI ID</p>
                                    <p className="font-bold text-slate-900">{selectedTxn.bankDetails.upiId}</p>
                                </div>
                            </div>
                        </Card>

                        {/* Order Breakdown if attached */}
                        {selectedTxn.orderPricing && (
                            <Card className="p-4 border-none bg-slate-50 ring-1 ring-slate-100 rounded-xl">
                                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 border-b border-slate-200 pb-2">
                                    Order Pricing Breakdown
                                </p>
                                <div className="grid grid-cols-3 gap-2 text-xs">
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">Delivery Fee</p>
                                        <p className="font-bold text-slate-900">₹{selectedTxn.orderPricing.deliveryFee || 0}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">Customer Tip</p>
                                        <p className="font-bold text-slate-900">₹{selectedTxn.orderPricing.tip || 0}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">Surge / Platform</p>
                                        <p className="font-bold text-slate-900">₹{selectedTxn.orderPricing.surgeCharge || 0}</p>
                                    </div>
                                </div>
                            </Card>
                        )}

                        <div className="pt-2">
                            <button
                                onClick={() => setSelectedTxn(null)}
                                className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-slate-800 transition-all"
                            >
                                Close Intelligence
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default DeliveryTransactions;
