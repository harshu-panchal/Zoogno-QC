import React, { useState, useEffect, useCallback } from "react";
import {
    Wallet,
    CheckCircle2,
    XCircle,
    ArrowLeft,
    Calendar,
    CalendarDays,
    CalendarRange,
    RotateCw,
} from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Card from "@/shared/components/ui/Card";
import { deliveryApi } from "../../services/deliveryApi";

const emptySummary = {
    today: { earned: 0, paid: 0, remaining: 0 },
    thisWeek: { earned: 0, paid: 0, remaining: 0 },
    thisMonth: { earned: 0, paid: 0, remaining: 0 },
    overall: { earned: 0, paid: 0, remaining: 0 },
};

const cn = (...classes) => classes.filter(Boolean).join(" ");

const formatDate = (value) => {
    if (!value) return "—";
    return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const SettlementWallet = () => {
    const navigate = useNavigate();
    const [summary, setSummary] = useState(emptySummary);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [historyLoading, setHistoryLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const fetchSummary = useCallback(async () => {
        try {
            setLoading(true);
            const res = await deliveryApi.getMySettlementSummary();
            if (res.data.success) {
                setSummary(res.data.result || emptySummary);
            }
        } catch (error) {
            console.error("Failed to fetch settlement summary:", error);
            toast.error("Failed to load settlement summary");
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchHistory = useCallback(async (pageNum = 1) => {
        try {
            setHistoryLoading(true);
            const res = await deliveryApi.getMySettlementHistory({ page: pageNum, limit: 10 });
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
    }, []);

    const refreshAll = () => {
        fetchSummary();
        fetchHistory(1);
    };

    useEffect(() => {
        fetchSummary();
        fetchHistory(1);
    }, [fetchSummary, fetchHistory]);

    const cards = [
        { label: "Today", key: "today", icon: Calendar },
        { label: "This Week", key: "thisWeek", icon: CalendarDays },
        { label: "This Month", key: "thisMonth", icon: CalendarRange },
        { label: "Overall", key: "overall", icon: Wallet },
    ];

    return (
        <div className="bg-gray-50/50 min-h-screen pb-24">
            {/* Top Header */}
            <div className="bg-white px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-50">
                <div className="flex items-center">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors mr-2"
                    >
                        <ArrowLeft className="text-gray-900" size={24} />
                    </button>
                    <h1 className="text-xl font-bold text-gray-900">Settlement Wallet</h1>
                </div>
                <button
                    onClick={refreshAll}
                    className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                >
                    <RotateCw className={cn("text-gray-600", (loading || historyLoading) && "animate-spin")} size={18} />
                </button>
            </div>

            <div className="p-6 space-y-4 max-w-lg mx-auto">
                <p className="text-xs text-gray-500 font-medium leading-relaxed px-1">
                    All payouts are recorded manually by the Admin. Track your earnings and payout history below.
                </p>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 gap-3">
                    {cards.map((card) => {
                        const data = summary[card.key] || { earned: 0, paid: 0, remaining: 0 };
                        return (
                            <Card key={card.key} className="p-4 rounded-2xl shadow-sm border border-gray-50">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="p-1.5 bg-brand-50 text-brand-600 rounded-lg">
                                        <card.icon size={14} />
                                    </div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{card.label}</p>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[9px] font-bold text-gray-400 uppercase">Earned</span>
                                        <span className="text-xs font-black text-gray-900">₹{Number(data.earned).toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[9px] font-bold text-gray-400 uppercase">Paid</span>
                                        <span className="text-xs font-black text-emerald-600">₹{Number(data.paid).toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                                        <span className="text-[9px] font-bold text-gray-400 uppercase">Remaining</span>
                                        <span className="text-xs font-black text-amber-600">₹{Number(data.remaining).toLocaleString()}</span>
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>

                {/* History */}
                <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between px-1">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2 uppercase tracking-widest text-[10px]">
                            Payout History
                        </h3>
                    </div>

                    <div className="space-y-3">
                        {historyLoading ? (
                            <div className="bg-white p-8 rounded-2xl border border-dashed border-gray-200 text-center">
                                <p className="text-xs text-gray-400 font-medium">Loading...</p>
                            </div>
                        ) : history.length > 0 ? (
                            history.map((item, idx) => (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    key={item.payoutId || item._id}
                                    className="bg-white p-4 rounded-2xl shadow-sm border border-gray-50 flex items-center justify-between"
                                >
                                    <div className="flex items-center">
                                        <div className={cn(
                                            "p-3 rounded-full mr-4",
                                            item.status === "PAID" ? "bg-brand-50 text-brand-600" : "bg-red-50 text-red-600"
                                        )}>
                                            {item.status === "PAID" ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                                        </div>
                                        <div>
                                            <p className={cn(
                                                "font-bold",
                                                item.status === "CANCELLED" ? "text-gray-400 line-through" : "text-gray-900"
                                            )}>₹{Number(item.amount || 0).toLocaleString()}</p>
                                            <p className="text-[10px] font-medium text-gray-400 mt-0.5">
                                                {formatDate(item.paymentDate || item.createdAt)} • {item.transactionReference || item.payoutId}
                                            </p>
                                            <p className="text-[9px] font-bold text-gray-400 uppercase mt-0.5">
                                                {(item.paymentMethod || "").replace("_", " ")}
                                            </p>
                                        </div>
                                    </div>
                                    <Badge variant={item.status === "PAID" ? "success" : "destructive"}>
                                        {item.status}
                                    </Badge>
                                </motion.div>
                            ))
                        ) : (
                            <div className="bg-white p-12 rounded-2xl border border-dashed border-gray-200 text-center">
                                <Wallet className="mx-auto text-gray-200 mb-2" size={32} />
                                <p className="text-xs text-gray-400 font-medium tracking-tight">No payouts have been recorded yet.</p>
                            </div>
                        )}
                    </div>

                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-3 pt-2">
                            <button
                                disabled={page <= 1 || historyLoading}
                                onClick={() => fetchHistory(page - 1)}
                                className="px-4 py-2 rounded-xl text-[10px] font-bold uppercase bg-white border border-gray-100 disabled:opacity-40"
                            >
                                Prev
                            </button>
                            <span className="text-[10px] font-bold text-gray-500 uppercase">Page {page} of {totalPages}</span>
                            <button
                                disabled={page >= totalPages || historyLoading}
                                onClick={() => fetchHistory(page + 1)}
                                className="px-4 py-2 rounded-xl text-[10px] font-bold uppercase bg-white border border-gray-100 disabled:opacity-40"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const Badge = ({ children, variant = "default" }) => {
    const variants = {
        default: "bg-gray-100 text-gray-600",
        success: "bg-brand-50 text-brand-600",
        warning: "bg-amber-50 text-amber-600",
        destructive: "bg-red-50 text-red-600",
    };

    return (
        <span className={cn("px-2 py-1 rounded text-[10px] font-bold tracking-wider leading-none", variants[variant])}>
            {children}
        </span>
    );
};

export default SettlementWallet;
