import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import Modal from '@shared/components/ui/Modal';
import Pagination from '@shared/components/ui/Pagination';
import {
    Banknote,
    Clock,
    CheckCircle2,
    XCircle,
    Search,
    Filter,
    Building2,
    Truck,
    CreditCard,
    Eye,
    Plus,
    FileText,
    RotateCw,
    Calendar,
    CalendarDays,
    CalendarRange,
    Wallet,
    History,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { adminApi } from "../services/adminApi";
import { toast } from "sonner";

const emptySummary = { totalEarnings: 0, totalPaid: 0, totalRemaining: 0, todayPayout: 0, weeklyPayout: 0, monthlyPayout: 0 };
const emptyBuckets = {
    today: { earned: 0, paid: 0, remaining: 0 },
    thisWeek: { earned: 0, paid: 0, remaining: 0 },
    thisMonth: { earned: 0, paid: 0, remaining: 0 },
    overall: { earned: 0, paid: 0, remaining: 0 },
};

const STATUS_VARIANT = {
    PENDING: 'warning',
    PARTIALLY_PAID: 'info',
    FULLY_PAID: 'success',
};

// Payout record status (distinct from the beneficiary-level STATUS_VARIANT above).
const PAYOUT_STATUS_VARIANT = {
    PAID: 'success',
    PENDING: 'warning',
    PROCESSING: 'info',
    FAILED: 'error',
    CANCELLED: 'error',
};

const PAYMENT_METHODS = [
    { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
    { value: 'UPI', label: 'UPI' },
    { value: 'CASH', label: 'Cash' },
    { value: 'OTHER', label: 'Other' },
];

const beneficiaryName = (b) => b?.shopName || b?.name || 'Unknown';
const formatDate = (value) => value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const todayISO = () => new Date().toISOString().slice(0, 10);

const SettlementManagement = () => {
    const [activeTab, setActiveTab] = useState('sellers'); // sellers | delivery
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterPeriod, setFilterPeriod] = useState('all'); // all, today, this_week, this_month, custom
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);

    const [summary, setSummary] = useState({ seller: emptySummary, deliveryPartner: emptySummary });

    const [payoutModal, setPayoutModal] = useState({ isOpen: false, row: null });
    const [detailModal, setDetailModal] = useState({ isOpen: false, row: null });

    const beneficiaryType = activeTab === 'sellers' ? 'SELLER' : 'DELIVERY_PARTNER';
    const activeSummary = activeTab === 'sellers' ? summary.seller : summary.deliveryPartner;

    const fetchSummary = useCallback(async () => {
        try {
            const res = await adminApi.getSettlementSummary();
            if (res.data.success) {
                setSummary(res.data.result || { seller: emptySummary, deliveryPartner: emptySummary });
            }
        } catch (error) {
            console.error("Failed to fetch settlement summary:", error);
        }
    }, []);

    const fetchRows = useCallback(async (pageNum = 1) => {
        try {
            setLoading(true);
            const params = { page: pageNum, limit: pageSize };
            if (searchTerm.trim()) params.search = searchTerm.trim();
            if (filterStatus !== 'all') params.status = filterStatus;
            if (filterPeriod !== 'all') {
                params.period = filterPeriod;
                if (filterPeriod === 'custom') {
                    params.startDate = customStart;
                    params.endDate = customEnd;
                }
            }

            const fetcher = activeTab === 'sellers' ? adminApi.getSellerBeneficiaries : adminApi.getDeliveryBeneficiaries;
            const res = await fetcher(params);
            if (res.data.success) {
                const payload = res.data.result || {};
                setRows(Array.isArray(payload.items) ? payload.items : []);
                setTotal(payload.total || 0);
                setTotalPages(payload.totalPages || 1);
                setPage(payload.page || pageNum);
            }
        } catch (error) {
            console.error("Fetch error:", error);
            toast.error("Failed to fetch beneficiaries");
        } finally {
            setLoading(false);
        }
    }, [activeTab, pageSize, searchTerm, filterStatus, filterPeriod, customStart, customEnd]);

    useEffect(() => {
        fetchSummary();
    }, [fetchSummary]);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchRows(1);
        }, 400);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, pageSize, searchTerm, filterStatus, filterPeriod, customStart, customEnd]);

    const refreshRow = () => {
        fetchRows(page);
        fetchSummary();
    };

    const periodLabel = filterPeriod === 'all' ? 'All Time'
        : filterPeriod === 'today' ? 'Today'
        : filterPeriod === 'this_week' ? 'This Week'
        : filterPeriod === 'this_month' ? 'This Month'
        : 'Custom Range';

    return (
        <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-1">
                <div>
                    <h1 className="ds-h1 flex items-center gap-3">
                        Settlement Management
                        <Badge variant="primary" className="text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider">Financial Hub</Badge>
                    </h1>
                    <p className="ds-description mt-1">Record and track manual payouts to sellers and delivery partners.</p>
                </div>
                <button
                    onClick={refreshRow}
                    className="p-2.5 bg-white ring-1 ring-slate-200 text-slate-600 rounded-2xl hover:bg-slate-50 transition-all shadow-sm"
                    title="Refresh"
                >
                    <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                    { label: 'Total Earnings', value: activeSummary.totalEarnings, icon: Wallet, bg: 'bg-brand-50', color: 'text-brand-500' },
                    { label: 'Total Paid', value: activeSummary.totalPaid, icon: CheckCircle2, bg: 'bg-emerald-50', color: 'text-emerald-500' },
                    { label: 'Total Remaining', value: activeSummary.totalRemaining, icon: Clock, bg: 'bg-amber-50', color: 'text-amber-500' },
                    { label: "Today's Payout", value: activeSummary.todayPayout, icon: Calendar, bg: 'bg-blue-50', color: 'text-blue-500' },
                    { label: 'Weekly Payout', value: activeSummary.weeklyPayout, icon: CalendarDays, bg: 'bg-purple-50', color: 'text-purple-500' },
                    { label: 'Monthly Payout', value: activeSummary.monthlyPayout, icon: CalendarRange, bg: 'bg-cyan-50', color: 'text-cyan-500' },
                ].map((stat, i) => (
                    <Card key={i} className="p-4 border-none shadow-sm ring-1 ring-slate-100 bg-white">
                        <div className={cn("p-2.5 rounded-xl w-fit mb-3", stat.bg)}>
                            <stat.icon className={cn("h-5 w-5", stat.color)} />
                        </div>
                        <p className="ds-label mb-1">{stat.label}</p>
                        <h3 className="text-lg font-black text-slate-900">₹{Number(stat.value || 0).toLocaleString()}</h3>
                    </Card>
                ))}
            </div>

            {/* Tabs + Filters */}
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex bg-slate-100 p-1.5 rounded-2xl w-fit">
                        <button
                            onClick={() => setActiveTab('sellers')}
                            className={cn(
                                "flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all",
                                activeTab === 'sellers' ? "bg-white text-slate-900 shadow-md" : "text-slate-500 hover:text-slate-700"
                            )}
                        >
                            <Building2 className="h-4 w-4" />
                            SELLERS
                        </button>
                        <button
                            onClick={() => setActiveTab('delivery')}
                            className={cn(
                                "flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all",
                                activeTab === 'delivery' ? "bg-white text-slate-900 shadow-md" : "text-slate-500 hover:text-slate-700"
                            )}
                        >
                            <Truck className="h-4 w-4" />
                            DELIVERY PARTNERS
                        </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative group">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-brand-600 transition-colors" />
                            <input
                                type="text"
                                placeholder="Search by name, phone, email..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 pr-4 py-2.5 bg-white ring-1 ring-slate-200 rounded-2xl text-xs font-semibold outline-none focus:ring-2 focus:ring-brand-500/20 w-64 transition-all"
                            />
                        </div>
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="px-3 py-2.5 bg-white ring-1 ring-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500/20"
                        >
                            <option value="all">All Status</option>
                            <option value="PENDING">Pending</option>
                            <option value="PARTIALLY_PAID">Partially Paid</option>
                            <option value="FULLY_PAID">Fully Paid</option>
                        </select>
                        <select
                            value={filterPeriod}
                            onChange={(e) => setFilterPeriod(e.target.value)}
                            className="px-3 py-2.5 bg-white ring-1 ring-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500/20"
                        >
                            <option value="all">All Time</option>
                            <option value="today">Today</option>
                            <option value="this_week">This Week</option>
                            <option value="this_month">This Month</option>
                            <option value="custom">Custom Range</option>
                        </select>
                        {filterPeriod === 'custom' && (
                            <>
                                <input
                                    type="date"
                                    value={customStart}
                                    onChange={(e) => setCustomStart(e.target.value)}
                                    className="px-3 py-2.5 bg-white ring-1 ring-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500/20"
                                />
                                <input
                                    type="date"
                                    value={customEnd}
                                    onChange={(e) => setCustomEnd(e.target.value)}
                                    className="px-3 py-2.5 bg-white ring-1 ring-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500/20"
                                />
                            </>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2 px-1">
                    <Filter className="h-3.5 w-3.5 text-brand-600" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Showing: {periodLabel}</span>
                </div>

                {/* Table */}
                <Card className="border-none shadow-2xl ring-1 ring-slate-100 overflow-hidden bg-white rounded-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50 border-b border-slate-100">
                                    <th className="ds-table-header-cell pl-8">Beneficiary</th>
                                    <th className="ds-table-header-cell text-right">Total Earnings</th>
                                    <th className="ds-table-header-cell text-right">Total Paid</th>
                                    <th className="ds-table-header-cell text-right">Remaining</th>
                                    <th className="ds-table-header-cell">Last Payout</th>
                                    <th className="ds-table-header-cell">Status</th>
                                    <th className="ds-table-header-cell text-right pr-8">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {loading ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-20 text-center text-slate-400 font-bold text-sm">Loading...</td>
                                    </tr>
                                ) : rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-20 text-center">
                                            <div className="flex flex-col items-center">
                                                <div className="p-4 bg-slate-50 rounded-full mb-4">
                                                    <FileText className="h-8 w-8 text-slate-200" />
                                                </div>
                                                <p className="text-slate-400 font-bold text-sm">No beneficiaries found for this filter.</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : rows.map((row) => (
                                    <tr key={row.beneficiary?._id} className="group hover:bg-slate-50/30 transition-all">
                                        <td className="px-6 py-5 pl-8">
                                            <div className="flex items-center gap-4">
                                                <div className={cn(
                                                    "h-10 w-10 rounded-2xl flex items-center justify-center shadow-inner",
                                                    "bg-brand-50 text-brand-600"
                                                )}>
                                                    {activeTab === 'sellers' ? <Building2 className="h-5 w-5" /> : <Truck className="h-5 w-5" />}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-slate-900">{beneficiaryName(row.beneficiary)}</p>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{row.beneficiary?.phone || row.beneficiary?.email || '—'}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <p className="text-sm font-black text-slate-900">₹{Number(row.totalEarned || 0).toLocaleString()}</p>
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <p className="text-sm font-black text-emerald-600">₹{Number(row.totalPaid || 0).toLocaleString()}</p>
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <p className="text-sm font-black text-amber-600">₹{Number(row.remaining || 0).toLocaleString()}</p>
                                        </td>
                                        <td className="px-6 py-5">
                                            <p className="text-xs font-bold text-slate-600">{formatDate(row.lastPayout?.paymentDate)}</p>
                                        </td>
                                        <td className="px-6 py-5">
                                            <Badge
                                                variant={STATUS_VARIANT[row.status] || 'gray'}
                                                className="text-[9px] font-black px-3 py-1 uppercase tracking-wider"
                                            >
                                                {row.status?.replace('_', ' ')}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-5 text-right pr-8">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => setDetailModal({ isOpen: true, row })}
                                                    className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:bg-slate-900 hover:text-white transition-all active:scale-90"
                                                    title="View Details"
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => setPayoutModal({ isOpen: true, row })}
                                                    disabled={Number(row.remaining || 0) <= 0}
                                                    className="p-2 bg-brand-50 text-brand-600 rounded-xl hover:bg-black hover:text-white transition-all active:scale-90 disabled:opacity-40 disabled:pointer-events-none"
                                                    title="Create Payout"
                                                >
                                                    <Plus className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-6 py-3 border-t border-slate-100">
                        <Pagination
                            page={page}
                            totalPages={totalPages}
                            total={total}
                            pageSize={pageSize}
                            onPageChange={(p) => fetchRows(p)}
                            onPageSizeChange={(newSize) => {
                                setPageSize(newSize);
                                setPage(1);
                            }}
                            loading={loading}
                        />
                    </div>
                </Card>
            </div>

            {/* Create Payout Modal */}
            {payoutModal.isOpen && (
                <CreatePayoutModal
                    row={payoutModal.row}
                    beneficiaryType={beneficiaryType}
                    onClose={() => setPayoutModal({ isOpen: false, row: null })}
                    onSuccess={(payout) => {
                        setPayoutModal({ isOpen: false, row: null });
                        if (payout?.payoutChannel === 'CASHFREE') {
                            if (payout.status === 'PAID') {
                                toast.success("Payout sent via Cashfree and confirmed paid");
                            } else if (payout.status === 'FAILED') {
                                toast.error(`Cashfree payout failed: ${payout.failureReason || 'unknown error'}`);
                            } else {
                                toast.success("Payout sent to Cashfree — awaiting bank confirmation");
                            }
                        } else {
                            toast.success("Payout recorded successfully");
                        }
                        refreshRow();
                    }}
                />
            )}

            {/* View Details Modal */}
            {detailModal.isOpen && (
                <BeneficiaryDetailModal
                    row={detailModal.row}
                    beneficiaryType={beneficiaryType}
                    onClose={() => setDetailModal({ isOpen: false, row: null })}
                    onCreatePayout={(row) => {
                        setDetailModal({ isOpen: false, row: null });
                        setPayoutModal({ isOpen: true, row });
                    }}
                    onChanged={refreshRow}
                />
            )}
        </div>
    );
};

/* ---------------- Create Payout Modal ---------------- */

/* Shows the beneficiary's saved bank/UPI details so the admin knows where the
   money actually needs to go — read-only reference, never sent to the backend. */
const PayoutDestinationDetails = ({ beneficiary, beneficiaryType, paymentMethod }) => {
    if (!beneficiary) return null;

    const bank = beneficiaryType === 'SELLER'
        ? {
            accountHolder: beneficiary.bankDetails?.accountHolderName,
            bankName: beneficiary.bankDetails?.bankName,
            accountNumber: beneficiary.bankDetails?.accountNumber,
            ifsc: beneficiary.bankDetails?.ifscCode,
        }
        : {
            accountHolder: beneficiary.accountHolder,
            bankName: null,
            accountNumber: beneficiary.accountNumber,
            ifsc: beneficiary.ifsc,
        };

    const upiId = beneficiaryType === 'SELLER' ? beneficiary.upiDetails?.upiId : beneficiary.upiId;

    if (paymentMethod === 'UPI') {
        return (
            <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4">
                <p className="text-[9px] font-black text-brand-600 uppercase tracking-widest mb-1.5">Pay to UPI ID</p>
                {upiId ? (
                    <p className="text-sm font-black text-slate-900">{upiId}</p>
                ) : (
                    <p className="text-xs font-bold text-rose-600">No UPI ID on file for this {beneficiaryType === 'SELLER' ? 'seller' : 'delivery partner'}.</p>
                )}
            </div>
        );
    }

    const hasBank = bank.accountNumber && bank.ifsc;
    return (
        <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4">
            <p className="text-[9px] font-black text-brand-600 uppercase tracking-widest mb-2">Pay to Bank Account</p>
            {hasBank ? (
                <div className="grid grid-cols-2 gap-y-1.5 text-xs">
                    <span className="font-bold text-slate-400">Account Holder</span>
                    <span className="font-black text-slate-900 text-right">{bank.accountHolder || "—"}</span>
                    {bank.bankName && (
                        <>
                            <span className="font-bold text-slate-400">Bank</span>
                            <span className="font-black text-slate-900 text-right">{bank.bankName}</span>
                        </>
                    )}
                    <span className="font-bold text-slate-400">Account Number</span>
                    <span className="font-black text-slate-900 text-right">{bank.accountNumber}</span>
                    <span className="font-bold text-slate-400">IFSC</span>
                    <span className="font-black text-slate-900 text-right">{bank.ifsc}</span>
                </div>
            ) : (
                <p className="text-xs font-bold text-rose-600">No bank details on file for this {beneficiaryType === 'SELLER' ? 'seller' : 'delivery partner'}.</p>
            )}
        </div>
    );
};

const CreatePayoutModal = ({ row, beneficiaryType, onClose, onSuccess }) => {
    const beneficiaryId = row?.beneficiary?._id;
    const [loadingFresh, setLoadingFresh] = useState(true);
    const [fresh, setFresh] = useState({ earned: 0, paid: 0, remaining: 0 });
    const [amount, setAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
    const [transactionReference, setTransactionReference] = useState('');
    const [paymentDate, setPaymentDate] = useState(todayISO());
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [amountError, setAmountError] = useState('');

    useEffect(() => {
        let cancelled = false;
        const fetchFresh = async () => {
            try {
                setLoadingFresh(true);
                const fetcher = beneficiaryType === 'SELLER' ? adminApi.getSellerSettlementDetail : adminApi.getDeliverySettlementDetail;
                const res = await fetcher(beneficiaryId);
                if (!cancelled && res.data.success) {
                    const overall = (res.data.result || {}).overall || { earned: 0, paid: 0, remaining: 0 };
                    setFresh(overall);
                }
            } catch (error) {
                console.error("Failed to fetch fresh beneficiary summary:", error);
                toast.error("Failed to load latest figures");
            } finally {
                if (!cancelled) setLoadingFresh(false);
            }
        };
        if (beneficiaryId) fetchFresh();
        return () => { cancelled = true; };
    }, [beneficiaryId, beneficiaryType]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setAmountError('');
        const numAmount = parseFloat(amount);
        if (!amount || isNaN(numAmount) || numAmount <= 0) {
            setAmountError('Enter a valid amount greater than ₹0.');
            return;
        }

        try {
            setSubmitting(true);
            const res = await adminApi.createSettlementPayout({
                beneficiaryType,
                beneficiaryId,
                amount: numAmount,
                paymentMethod,
                transactionReference: transactionReference || undefined,
                paymentDate: paymentDate || undefined,
                notes: notes || undefined,
            });
            if (res.data.success) {
                onSuccess(res.data.result);
            }
        } catch (error) {
            const message = error.response?.data?.message || "Failed to record payout";
            setAmountError(message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal isOpen={true} onClose={() => !submitting && onClose()} title="Record Payout" size="md">
            <form onSubmit={handleSubmit} className="space-y-5">
                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="h-12 w-12 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shadow-sm">
                        {beneficiaryType === 'SELLER' ? <Building2 className="h-6 w-6" /> : <Truck className="h-6 w-6" />}
                    </div>
                    <div>
                        <p className="text-sm font-black text-slate-900">{beneficiaryName(row?.beneficiary)}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{row?.beneficiary?.phone || row?.beneficiary?.email}</p>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-50 rounded-xl p-3 text-center">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Earned</p>
                        <p className="text-sm font-black text-slate-900">{loadingFresh ? '…' : `₹${Number(fresh.earned).toLocaleString()}`}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 text-center">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Already Paid</p>
                        <p className="text-sm font-black text-emerald-600">{loadingFresh ? '…' : `₹${Number(fresh.paid).toLocaleString()}`}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 text-center">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Remaining</p>
                        <p className="text-sm font-black text-amber-600">{loadingFresh ? '…' : `₹${Number(fresh.remaining).toLocaleString()}`}</p>
                    </div>
                </div>

                <div>
                    <label className="text-xs font-black text-slate-600 uppercase tracking-widest mb-2 block">Amount</label>
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-black">₹</span>
                        <input
                            type="number"
                            step="0.01"
                            value={amount}
                            onChange={(e) => { setAmount(e.target.value); setAmountError(''); }}
                            placeholder="0.00"
                            className={cn(
                                "w-full pl-9 pr-4 py-3 rounded-xl font-bold text-slate-900 outline-none transition-all ring-1",
                                amountError ? "ring-rose-300 focus:ring-2 focus:ring-rose-400" : "ring-slate-200 focus:ring-2 focus:ring-brand-500/20"
                            )}
                        />
                    </div>
                    {amountError && (
                        <p className="text-xs font-bold text-rose-600 mt-1.5">{amountError}</p>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-black text-slate-600 uppercase tracking-widest mb-2 block">Payment Method</label>
                        <select
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl ring-1 ring-slate-200 font-bold text-sm outline-none focus:ring-2 focus:ring-brand-500/20"
                        >
                            {PAYMENT_METHODS.map((m) => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-black text-slate-600 uppercase tracking-widest mb-2 block">Payment Date</label>
                        <input
                            type="date"
                            value={paymentDate}
                            onChange={(e) => setPaymentDate(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl ring-1 ring-slate-200 font-bold text-sm outline-none focus:ring-2 focus:ring-brand-500/20"
                        />
                    </div>
                </div>

                {(paymentMethod === 'BANK_TRANSFER' || paymentMethod === 'UPI') && (
                    <>
                        <p className="text-[10px] font-bold text-brand-600 bg-brand-50 rounded-lg px-3 py-2 -mt-2">
                            This will be sent automatically via Cashfree — funds are disbursed to the account below as soon as you submit.
                        </p>
                        <PayoutDestinationDetails beneficiary={row?.beneficiary} beneficiaryType={beneficiaryType} paymentMethod={paymentMethod} />
                    </>
                )}

                <div>
                    <label className="text-xs font-black text-slate-600 uppercase tracking-widest mb-2 block">Transaction / Reference ID</label>
                    <input
                        type="text"
                        value={transactionReference}
                        onChange={(e) => setTransactionReference(e.target.value)}
                        placeholder="UTR / UPI ref / cheque no."
                        className="w-full px-4 py-3 rounded-xl ring-1 ring-slate-200 font-bold text-sm outline-none focus:ring-2 focus:ring-brand-500/20"
                    />
                </div>

                <div>
                    <label className="text-xs font-black text-slate-600 uppercase tracking-widest mb-2 block">Notes</label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                        placeholder="Optional notes for this payout"
                        className="w-full px-4 py-3 rounded-xl ring-1 ring-slate-200 font-medium text-sm outline-none focus:ring-2 focus:ring-brand-500/20 resize-none"
                    />
                </div>

                <div className="flex gap-3 pt-2">
                    <button
                        type="submit"
                        disabled={submitting || loadingFresh}
                        className="flex-1 py-3 bg-black text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {submitting && <RotateCw className="h-4 w-4 animate-spin" />}
                        {submitting
                            ? (paymentMethod === 'BANK_TRANSFER' || paymentMethod === 'UPI') ? 'SENDING...' : 'RECORDING...'
                            : (paymentMethod === 'BANK_TRANSFER' || paymentMethod === 'UPI') ? 'Send Payout' : 'Record Payout'}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="flex-1 py-3 bg-white ring-1 ring-slate-200 text-slate-600 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-slate-50 transition-all"
                    >
                        Cancel
                    </button>
                </div>
            </form>
        </Modal>
    );
};

/* ---------------- Beneficiary Detail Modal ---------------- */

const BeneficiaryDetailModal = ({ row, beneficiaryType, onClose, onCreatePayout, onChanged }) => {
    const beneficiaryId = row?.beneficiary?._id;
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState(emptyBuckets);
    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [cancellingId, setCancellingId] = useState(null);
    const [refreshingId, setRefreshingId] = useState(null);

    const fetchSummary = useCallback(async () => {
        try {
            setLoading(true);
            const fetcher = beneficiaryType === 'SELLER' ? adminApi.getSellerSettlementDetail : adminApi.getDeliverySettlementDetail;
            const res = await fetcher(beneficiaryId);
            if (res.data.success) {
                setSummary(res.data.result || emptyBuckets);
            }
        } catch (error) {
            console.error("Failed to fetch beneficiary summary:", error);
            toast.error("Failed to load beneficiary summary");
        } finally {
            setLoading(false);
        }
    }, [beneficiaryId, beneficiaryType]);

    const fetchHistory = useCallback(async (pageNum = 1) => {
        try {
            setHistoryLoading(true);
            const res = await adminApi.getSettlementHistory(beneficiaryId, { type: beneficiaryType, page: pageNum, limit: 10 });
            if (res.data.success) {
                const payload = res.data.result || {};
                setHistory(Array.isArray(payload.items) ? payload.items : []);
                setTotalPages(payload.totalPages || 1);
                setPage(payload.page || pageNum);
            }
        } catch (error) {
            console.error("Failed to fetch payout history:", error);
            toast.error("Failed to load payout history");
        } finally {
            setHistoryLoading(false);
        }
    }, [beneficiaryId, beneficiaryType]);

    useEffect(() => {
        if (beneficiaryId) {
            fetchSummary();
            fetchHistory(1);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [beneficiaryId]);

    const handleCancelPayout = async (payout) => {
        const reason = window.prompt(`Reason for cancelling payout of ₹${Number(payout.amount).toLocaleString()}?`);
        if (reason === null) return;
        if (!reason.trim()) {
            toast.error("A cancellation reason is required");
            return;
        }
        try {
            setCancellingId(payout.payoutId);
            const res = await adminApi.cancelSettlementPayout(payout.payoutId, { reason: reason.trim() });
            if (res.data.success) {
                toast.success("Payout cancelled");
                fetchSummary();
                fetchHistory(page);
                onChanged?.();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to cancel payout");
        } finally {
            setCancellingId(null);
        }
    };

    const handleRefreshStatus = async (payout) => {
        try {
            setRefreshingId(payout.payoutId);
            const res = await adminApi.refreshSettlementPayoutStatus(payout.payoutId);
            if (res.data.success) {
                toast.success(`Status: ${res.data.result?.status || 'updated'}`);
                fetchSummary();
                fetchHistory(page);
                onChanged?.();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to refresh status");
        } finally {
            setRefreshingId(null);
        }
    };

    const cards = [
        { label: 'Today', key: 'today', icon: Calendar },
        { label: 'This Week', key: 'thisWeek', icon: CalendarDays },
        { label: 'This Month', key: 'thisMonth', icon: CalendarRange },
        { label: 'Overall', key: 'overall', icon: Wallet },
    ];

    return (
        <Modal isOpen={true} onClose={onClose} title="Beneficiary Settlement Details" size="xl">
            <div className="space-y-6">
                <div className="flex items-center justify-between gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-xl bg-black text-white flex items-center justify-center shadow-xl">
                            {beneficiaryType === 'SELLER' ? <Building2 className="h-7 w-7" /> : <Truck className="h-7 w-7" />}
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-slate-900">{beneficiaryName(row?.beneficiary)}</h3>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                {row?.beneficiary?.phone || '—'} {row?.beneficiary?.email ? `• ${row.beneficiary.email}` : ''}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => onCreatePayout(row)}
                        className="px-4 py-2.5 bg-black text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg flex items-center gap-2 shrink-0"
                    >
                        <Plus className="h-3.5 w-3.5" /> Create Payout
                    </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {cards.map((card) => {
                        const data = summary[card.key] || { earned: 0, paid: 0, remaining: 0 };
                        return (
                            <div key={card.key} className="bg-white rounded-xl p-4 ring-1 ring-slate-100">
                                <div className="flex items-center gap-2 mb-2">
                                    <card.icon className="h-3.5 w-3.5 text-brand-500" />
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{card.label}</p>
                                </div>
                                <p className="text-xs font-bold text-slate-500">Earned: <span className="text-slate-900 font-black">₹{loading ? '…' : Number(data.earned).toLocaleString()}</span></p>
                                <p className="text-xs font-bold text-slate-500">Paid: <span className="text-emerald-600 font-black">₹{loading ? '…' : Number(data.paid).toLocaleString()}</span></p>
                                <p className="text-xs font-bold text-slate-500">Left: <span className="text-amber-600 font-black">₹{loading ? '…' : Number(data.remaining).toLocaleString()}</span></p>
                            </div>
                        );
                    })}
                </div>

                <div>
                    <p className="ds-label mb-3 flex items-center gap-2"><History className="h-3.5 w-3.5 text-brand-500" /> Payout History</p>
                    <div className="border border-slate-100 rounded-xl overflow-hidden">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50/50">
                                    <th className="ds-table-header-cell pl-4">Date</th>
                                    <th className="ds-table-header-cell">Amount</th>
                                    <th className="ds-table-header-cell">Method</th>
                                    <th className="ds-table-header-cell">Reference</th>
                                    <th className="ds-table-header-cell">Status</th>
                                    <th className="ds-table-header-cell text-right pr-4">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {historyLoading ? (
                                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-xs font-bold">Loading...</td></tr>
                                ) : history.length === 0 ? (
                                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-xs font-bold">No payouts recorded yet.</td></tr>
                                ) : history.map((item) => (
                                    <tr key={item.payoutId || item._id} className="hover:bg-slate-50/50">
                                        <td className="px-4 py-3 text-xs font-bold text-slate-700">{formatDate(item.paymentDate || item.createdAt)}</td>
                                        <td className={cn("px-4 py-3 text-xs font-black", item.status === 'CANCELLED' ? "text-slate-400 line-through" : "text-slate-900")}>
                                            ₹{Number(item.amount || 0).toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">
                                            {(item.paymentMethod || '').replace('_', ' ')}
                                            {item.payoutChannel === 'CASHFREE' && (
                                                <span className="ml-1.5 text-[8px] font-black text-brand-500 normal-case">via Cashfree</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-xs font-mono text-slate-500">{item.transactionReference || item.cashfreeReferenceId || '—'}</td>
                                        <td className="px-4 py-3">
                                            <Badge variant={PAYOUT_STATUS_VARIANT[item.status] || 'error'} className="text-[8px] font-black uppercase">
                                                {item.status}
                                            </Badge>
                                            {item.status === 'CANCELLED' && item.cancelReason && (
                                                <p className="text-[9px] text-rose-500 font-bold mt-0.5 italic">{item.cancelReason}</p>
                                            )}
                                            {item.status === 'FAILED' && item.failureReason && (
                                                <p className="text-[9px] text-rose-500 font-bold mt-0.5 italic">{item.failureReason}</p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right pr-4 space-x-3">
                                            {item.payoutChannel === 'CASHFREE' && (item.status === 'PENDING' || item.status === 'PROCESSING') && (
                                                <button
                                                    onClick={() => handleRefreshStatus(item)}
                                                    disabled={refreshingId === item.payoutId}
                                                    className="text-[10px] font-black text-brand-600 hover:underline uppercase disabled:opacity-40"
                                                >
                                                    {refreshingId === item.payoutId ? 'Checking...' : 'Refresh'}
                                                </button>
                                            )}
                                            {(item.status === 'PENDING' || item.status === 'PROCESSING' || item.status === 'FAILED' || (item.status === 'PAID' && item.payoutChannel === 'MANUAL')) && (
                                                <button
                                                    onClick={() => handleCancelPayout(item)}
                                                    disabled={cancellingId === item.payoutId}
                                                    className="text-[10px] font-black text-rose-600 hover:underline uppercase disabled:opacity-40"
                                                >
                                                    {cancellingId === item.payoutId ? 'Cancelling...' : 'Cancel'}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {totalPages > 1 && (
                        <div className="pt-3">
                            <Pagination
                                page={page}
                                totalPages={totalPages}
                                total={history.length}
                                pageSize={10}
                                onPageChange={(p) => fetchHistory(p)}
                                loading={historyLoading}
                                compact
                            />
                        </div>
                    )}
                </div>

                <button
                    onClick={onClose}
                    className="w-full py-3 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest"
                >
                    Close
                </button>
            </div>
        </Modal>
    );
};

export default SettlementManagement;
