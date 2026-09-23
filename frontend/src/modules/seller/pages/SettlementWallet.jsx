import React, { useEffect, useState, useCallback } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import {
    Wallet,
    Calendar,
    CalendarDays,
    CalendarRange,
    History,
    CheckCircle2,
    XCircle,
    Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BlurFade } from "@/components/ui/blur-fade";
import { sellerApi } from "../services/sellerApi";
import { toast } from "sonner";
import Pagination from "@shared/components/ui/Pagination";

const emptySummary = {
    today: { earned: 0, paid: 0, remaining: 0 },
    thisWeek: { earned: 0, paid: 0, remaining: 0 },
    thisMonth: { earned: 0, paid: 0, remaining: 0 },
    overall: { earned: 0, paid: 0, remaining: 0 },
};

const formatDate = (value) => {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const SettlementWallet = () => {
    const [summary, setSummary] = useState(emptySummary);
    const [summaryLoading, setSummaryLoading] = useState(true);
    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);

    const fetchSummary = useCallback(async () => {
        try {
            setSummaryLoading(true);
            const res = await sellerApi.getMySettlementSummary();
            if (res.data.success) {
                setSummary(res.data.result || emptySummary);
            }
        } catch (error) {
            console.error("Failed to fetch settlement summary:", error);
            toast.error("Failed to load settlement summary");
        } finally {
            setSummaryLoading(false);
        }
    }, []);

    const fetchHistory = useCallback(async (pageNum = 1, size = pageSize) => {
        try {
            setHistoryLoading(true);
            const res = await sellerApi.getMySettlementHistory({ page: pageNum, limit: size });
            if (res.data.success) {
                const payload = res.data.result || {};
                setHistory(Array.isArray(payload.items) ? payload.items : []);
                setTotal(payload.total || 0);
                setTotalPages(payload.totalPages || 1);
                setPage(payload.page || pageNum);
            }
        } catch (error) {
            console.error("Failed to fetch payout history:", error);
            toast.error("Failed to load payout history");
        } finally {
            setHistoryLoading(false);
        }
    }, [pageSize]);

    useEffect(() => {
        fetchSummary();
    }, [fetchSummary]);

    useEffect(() => {
        fetchHistory(1, pageSize);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageSize]);

    const filteredHistory = history.filter((item) => {
        const term = searchTerm.toLowerCase();
        if (!term) return true;
        const ref = (item.transactionReference || item.payoutId || '').toString().toLowerCase();
        const method = (item.paymentMethod || '').toString().toLowerCase();
        const status = (item.status || '').toString().toLowerCase();
        return ref.includes(term) || method.includes(term) || status.includes(term);
    });

    const cards = [
        { label: 'Today', key: 'today', icon: Calendar },
        { label: 'This Week', key: 'thisWeek', icon: CalendarDays },
        { label: 'This Month', key: 'thisMonth', icon: CalendarRange },
        { label: 'Overall', key: 'overall', icon: Wallet },
    ];

    if (summaryLoading) {
        return <div className="flex items-center justify-center h-screen font-black text-slate-600">LOADING SETTLEMENTS...</div>;
    }

    return (
        <div className="space-y-8 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <BlurFade delay={0.1}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                            Settlement Wallet
                            <div className="p-1.5 bg-brand-100 rounded-lg">
                                <Wallet className="h-5 w-5 text-brand-600" />
                            </div>
                        </h1>
                        <p className="text-slate-600 text-base mt-1 font-medium">
                            All payouts are recorded manually by the Admin. Track your earnings and payout history here.
                        </p>
                    </div>
                </div>
            </BlurFade>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                {cards.map((card, i) => {
                    const data = summary[card.key] || { earned: 0, paid: 0, remaining: 0 };
                    return (
                        <BlurFade key={card.key} delay={0.2 + i * 0.1}>
                            <Card className="p-6 border-none shadow-sm ring-1 ring-slate-100 hover:ring-brand-200 transition-all bg-white group relative overflow-hidden">
                                <div className="relative z-10">
                                    <div className="h-10 w-10 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110 bg-brand-50 text-brand-600">
                                        <card.icon className="h-5 w-5" />
                                    </div>
                                    <p className="text-xs font-black text-slate-600 uppercase tracking-widest mb-3">{card.label}</p>
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase">Earned</span>
                                            <span className="text-sm font-black text-slate-900">₹{Number(data.earned).toLocaleString()}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase">Paid</span>
                                            <span className="text-sm font-black text-emerald-600">₹{Number(data.paid).toLocaleString()}</span>
                                        </div>
                                        <div className="flex items-center justify-between pt-1.5 border-t border-slate-100">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase">Remaining</span>
                                            <span className="text-sm font-black text-amber-600">₹{Number(data.remaining).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="absolute -bottom-4 -right-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
                                    <card.icon className="h-24 w-24" />
                                </div>
                            </Card>
                        </BlurFade>
                    );
                })}
            </div>

            {/* History Table */}
            <BlurFade delay={0.5}>
                <Card className="border-none shadow-xl ring-1 ring-slate-100 overflow-hidden bg-white rounded-3xl">
                    <div className="p-4 sm:p-6 border-b border-slate-50 flex flex-col md:flex-row justify-between items-center gap-3 sm:gap-4">
                        <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                            <History className="h-5 w-5 text-brand-500" />
                            Payout History
                        </h2>
                        <div className="relative w-full md:w-64 group">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-600 group-focus-within:text-brand-500 transition-colors" />
                            <input
                                type="text"
                                placeholder="Search reference or status..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                            />
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left min-w-[640px]">
                            <thead>
                                <tr className="bg-slate-50/50">
                                    <th className="px-8 py-4 text-xs font-black text-slate-600 uppercase tracking-widest">Date</th>
                                    <th className="px-8 py-4 text-xs font-black text-slate-600 uppercase tracking-widest">Amount</th>
                                    <th className="px-8 py-4 text-xs font-black text-slate-600 uppercase tracking-widest">Method</th>
                                    <th className="px-8 py-4 text-xs font-black text-slate-600 uppercase tracking-widest">Reference</th>
                                    <th className="px-8 py-4 text-xs font-black text-slate-600 uppercase tracking-widest text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {historyLoading ? (
                                    <tr>
                                        <td colSpan={5} className="px-8 py-12 text-center text-slate-600 text-sm font-medium">Loading...</td>
                                    </tr>
                                ) : filteredHistory.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-8 py-12 text-center text-slate-600 text-sm font-medium">
                                            {history.length === 0 ? "No payouts have been recorded yet." : "No matches for your search."}
                                        </td>
                                    </tr>
                                ) : filteredHistory.map((item) => (
                                    <tr key={item.payoutId || item._id} className="group hover:bg-slate-50/50 transition-all">
                                        <td className="px-8 py-5">
                                            <p className="text-sm font-black text-slate-900">{formatDate(item.paymentDate || item.createdAt)}</p>
                                        </td>
                                        <td className="px-8 py-5">
                                            <p className={cn(
                                                "text-sm font-black",
                                                item.status === 'CANCELLED' ? "text-slate-400 line-through" : "text-slate-900"
                                            )}>₹{Number(item.amount || 0).toLocaleString()}</p>
                                        </td>
                                        <td className="px-8 py-5">
                                            <p className="text-xs font-bold text-slate-600 uppercase">{(item.paymentMethod || '').replace('_', ' ')}</p>
                                        </td>
                                        <td className="px-8 py-5">
                                            <p className="text-xs font-bold text-slate-600 font-mono">{item.transactionReference || item.payoutId || '—'}</p>
                                        </td>
                                        <td className="px-8 py-5 text-center">
                                            <Badge
                                                variant={item.status === 'PAID' ? 'success' : 'error'}
                                                className="text-[8px] font-black px-2.5 py-0.5 uppercase tracking-widest rounded-lg"
                                            >
                                                {item.status === 'PAID' ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                                                {item.status}
                                            </Badge>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {total > 0 && (
                        <div className="p-4 sm:p-5 border-t border-slate-50 bg-slate-50/40">
                            <Pagination
                                page={page}
                                totalPages={totalPages}
                                total={total}
                                pageSize={pageSize}
                                onPageChange={(newPage) => fetchHistory(newPage, pageSize)}
                                onPageSizeChange={(newSize) => {
                                    setPageSize(newSize);
                                    setPage(1);
                                }}
                                loading={historyLoading}
                            />
                        </div>
                    )}
                </Card>
            </BlurFade>
        </div>
    );
};

export default SettlementWallet;
