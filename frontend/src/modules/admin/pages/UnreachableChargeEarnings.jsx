import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Banknote, RefreshCw, Search } from 'lucide-react';
import { adminApi } from '../services/adminApi';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import Pagination from '@shared/components/ui/Pagination';

const TABS = [
    { id: 'pending', label: 'Pending Recovery', status: 'OUTSTANDING' },
    { id: 'recovered', label: 'Recovered', status: 'RECOVERED' },
    { id: 'history', label: 'Earnings History', status: '' },
];

const STATUS = {
    PENDING: { label: 'Pending', variant: 'warning' },
    APPLIED: { label: 'Applied (in order)', variant: 'info' },
    RECOVERED: { label: 'Recovered', variant: 'success' },
    WAIVED: { label: 'Waived', variant: 'gray' },
    CANCELLED: { label: 'Cancelled', variant: 'gray' },
};

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (value) =>
    value
        ? new Date(value).toLocaleString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
          })
        : '—';

const SummaryCard = ({ label, value, hint, tone = 'text-slate-900' }) => (
    <div className="bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm p-4">
        <div className="text-[11px] font-black uppercase tracking-wide text-slate-400">{label}</div>
        <div className={`text-2xl font-black mt-1 ${tone}`}>{value}</div>
        {hint && <div className="text-xs text-slate-500 mt-0.5">{hint}</div>}
    </div>
);

const UnreachableChargeEarnings = () => {
    const navigate = useNavigate();
    const { tab: tabParam } = useParams();
    const tab = TABS.some((t) => t.id === tabParam) ? tabParam : 'pending';
    const activeTab = TABS.find((t) => t.id === tab);

    const [summary, setSummary] = useState(null);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    const fetchSummary = useCallback(async () => {
        try {
            const res = await adminApi.getUnreachableEarnings();
            setSummary(res.data?.result || null);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to load earnings summary');
        }
    }, []);

    const fetchRows = useCallback(async () => {
        setLoading(true);
        try {
            const res = await adminApi.getUnreachableCharges({
                status: activeTab.status,
                search: query,
                page,
                limit: pageSize,
            });
            const data = res.data?.result || {};
            setRows(data.items || []);
            setTotal(data.total || 0);
            setTotalPages(data.totalPages || 1);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to load charges');
        } finally {
            setLoading(false);
        }
    }, [activeTab.status, query, page, pageSize]);

    useEffect(() => {
        fetchSummary();
    }, [fetchSummary]);

    useEffect(() => {
        fetchRows();
    }, [fetchRows]);

    const refresh = () => {
        fetchSummary();
        fetchRows();
    };

    const changeTab = (next) => {
        setPage(1);
        navigate(
            next === 'pending'
                ? '/admin/customer-unreachable/earnings'
                : `/admin/customer-unreachable/earnings/${next}`,
        );
    };

    const waive = async (row) => {
        const reason = window.prompt(`Waive ${money(row.amount)} charge for ${row.customerName || 'customer'}? Enter a reason:`);
        if (reason === null) return;
        try {
            await adminApi.waiveUnreachableCharge(row._id, { reason });
            toast.success('Charge waived');
            refresh();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Could not waive charge');
        }
    };

    return (
        <div className="ds-section-spacing animate-in fade-in duration-700">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="ds-h1 flex items-center gap-3 text-emerald-600">
                        <Banknote className="h-8 w-8" />
                        Unreachable Charge Earnings
                    </h1>
                    <p className="ds-description mt-1">
                        Charges recovered from customers after a Customer Unreachable cancellation. This money is platform
                        earning only — never seller or delivery earning.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => navigate('/admin/customer-unreachable')}
                        className="px-4 py-2 bg-white rounded-lg shadow-sm border font-semibold text-sm"
                    >
                        Unreachable Orders
                    </button>
                    <button
                        onClick={refresh}
                        className="px-4 py-2 bg-white rounded-lg shadow-sm border font-semibold text-sm flex items-center gap-2"
                    >
                        <RefreshCw className="h-4 w-4" /> Refresh
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <SummaryCard label="Total Charges Generated" value={money(summary?.totalChargesGenerated)} />
                <SummaryCard
                    label="Pending Recovery"
                    value={money(summary?.pendingRecovery)}
                    hint={`${summary?.counts?.pending || 0} charge(s)`}
                    tone="text-amber-600"
                />
                <SummaryCard
                    label="Recovered Amount"
                    value={money(summary?.recoveredAmount)}
                    hint={`${summary?.counts?.recovered || 0} charge(s)`}
                    tone="text-emerald-600"
                />
                <SummaryCard label="Waived" value={money(summary?.waivedAmount)} tone="text-slate-500" />
                <SummaryCard label="Today's Earnings" value={money(summary?.todayEarnings)} tone="text-emerald-600" />
                <SummaryCard label="Weekly Earnings" value={money(summary?.weeklyEarnings)} tone="text-emerald-600" />
                <SummaryCard label="Monthly Earnings" value={money(summary?.monthlyEarnings)} tone="text-emerald-600" />
                <SummaryCard label="Total Earnings" value={money(summary?.totalEarnings)} tone="text-emerald-700" />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex flex-wrap gap-2">
                    {TABS.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => changeTab(t.id)}
                            className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
                                tab === t.id
                                    ? 'bg-slate-900 text-white border-slate-900'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        setPage(1);
                        setQuery(search.trim());
                    }}
                    className="relative"
                >
                    <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search charge ID, customer, order"
                        className="pl-9 pr-3 py-2 w-72 rounded-lg border border-slate-200 text-sm bg-white"
                    />
                </form>
            </div>

            <Card className="border-none shadow-sm ring-1 ring-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
                            <tr>
                                {[
                                    'Transaction ID',
                                    'Customer',
                                    'Original Order',
                                    'Order Amount',
                                    'Charge',
                                    'Recovered In Order',
                                    'Recovery Date',
                                    'Status',
                                    'Applied By',
                                    'Created',
                                    '',
                                ].map((h) => (
                                    <th key={h} className="px-4 py-3 text-left font-bold whitespace-nowrap">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={11} className="py-16 text-center text-slate-400">
                                        Loading...
                                    </td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={11} className="py-16 text-center text-slate-400">
                                        No charges found.
                                    </td>
                                </tr>
                            ) : (
                                rows.map((row) => {
                                    const st = STATUS[row.status] || STATUS.PENDING;
                                    return (
                                        <tr key={row._id} className="hover:bg-slate-50/60">
                                            <td className="px-4 py-3 font-mono text-xs font-bold whitespace-nowrap">{row.chargeId}</td>
                                            <td className="px-4 py-3">
                                                <div className="font-semibold text-slate-800">{row.customerName || '—'}</div>
                                                <div className="text-xs text-slate-500">{row.customerPhone || ''}</div>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">#{row.originalOrderId}</td>
                                            <td className="px-4 py-3 whitespace-nowrap">{money(row.originalOrderAmount)}</td>
                                            <td className="px-4 py-3 font-bold text-rose-600 whitespace-nowrap">{money(row.amount)}</td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {row.appliedOrderId ? `#${row.appliedOrderId}` : '—'}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-slate-600">{fmtDate(row.recoveredAt)}</td>
                                            <td className="px-4 py-3">
                                                <Badge variant={st.variant}>{st.label}</Badge>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-slate-600">{row.createdByName || '—'}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-slate-600">{fmtDate(row.createdAt)}</td>
                                            <td className="px-4 py-3">
                                                {row.status === 'PENDING' && (
                                                    <button
                                                        onClick={() => waive(row)}
                                                        className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-bold"
                                                    >
                                                        Waive
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="p-4 border-t border-slate-100">
                    <Pagination
                        page={page}
                        totalPages={totalPages}
                        total={total}
                        pageSize={pageSize}
                        onPageChange={setPage}
                        onPageSizeChange={(size) => {
                            setPageSize(size);
                            setPage(1);
                        }}
                        loading={loading}
                    />
                </div>
            </Card>
        </div>
    );
};

export default UnreachableChargeEarnings;
