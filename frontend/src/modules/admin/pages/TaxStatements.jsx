import React, { useState, useEffect } from 'react';
import Card from '@shared/components/ui/Card';
import { adminFinanceApi } from '../services/api/financeApi';
import { toast } from 'sonner';
import { 
    FileText, 
    Download, 
    Calendar, 
    TrendingUp,
    RefreshCw,
    AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

const TaxStatements = () => {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState({ summary: {}, breakdown: [], dailyTrend: [] });
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const fetchData = async () => {
        try {
            setLoading(true);
            const params = {};
            if (startDate) params.startDate = startDate;
            if (endDate) params.endDate = endDate;

            const res = await adminFinanceApi.getTaxStatements(params);
            if (res.data.success) {
                setData(res.data.result);
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to fetch tax statements');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startDate, endDate]);

    const handleExport = () => {
        // Simple CSV generation based on breakdown
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "GST Rate (%),Total Taxable Value,Items Sold,Calculated Tax\n";
        
        data.breakdown.forEach(row => {
            csvContent += `${row.gstRate},${row.totalTaxableValue},${row.itemsSold},${row.calculatedTax}\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `tax_statement_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const stats = [
        {
            label: 'Total Orders',
            value: data.summary.totalOrders || 0,
            icon: FileText,
            color: 'text-indigo-600',
            bg: 'bg-indigo-50',
            glow: 'shadow-[0_0_15px_rgba(79,70,229,0.3)]',
        },
        {
            label: 'Total Tax Collected',
            value: `₹${(data.summary.totalTaxCollected || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
            icon: TrendingUp,
            color: 'text-rose-600',
            bg: 'bg-rose-50',
            glow: 'shadow-[0_0_15px_rgba(225,29,72,0.3)]',
        },
        {
            label: 'Total Product Subtotal',
            value: `₹${(data.summary.totalProductSubtotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
            icon: TrendingUp,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
            glow: 'shadow-[0_0_15px_rgba(16,185,129,0.3)]',
        },
        {
            label: 'Total Delivery Fee',
            value: `₹${(data.summary.totalDeliveryFeeCharged || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
            icon: TrendingUp,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
            glow: 'shadow-[0_0_15px_rgba(217,119,6,0.3)]',
        }
    ];

    return (
        <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 duration-700 space-y-8">
            {/* Premium Header Section */}
            <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-8 shadow-2xl">
                <div className="absolute -right-20 -top-20 opacity-10 blur-3xl">
                    <div className="h-64 w-64 rounded-full bg-brand-400"></div>
                </div>
                <div className="absolute -left-20 -bottom-20 opacity-10 blur-3xl">
                    <div className="h-64 w-64 rounded-full bg-purple-400"></div>
                </div>
                
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 mb-4 backdrop-blur-md">
                            <span className="h-2 w-2 rounded-full bg-brand-400 animate-pulse"></span>
                            <span className="text-[10px] font-black tracking-widest text-white uppercase">Finance Hub</span>
                        </div>
                        <h1 className="text-4xl font-black text-white tracking-tight">Tax Statements</h1>
                        <p className="text-slate-400 font-medium mt-2 text-sm max-w-xl">
                            Analyze, track, and export the Goods and Services Tax (GST) collected across all delivered orders on your platform.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleExport}
                            className="bg-white hover:bg-slate-50 text-slate-900 rounded-xl font-black uppercase shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-all flex items-center justify-center gap-2 px-6 py-3 hover:scale-105 active:scale-95 text-xs tracking-wider"
                        >
                            <Download className="h-4 w-4 text-brand-600" />
                            EXPORT CSV
                        </button>
                    </div>
                </div>
            </div>

            {/* Glassmorphism Filters */}
            <div className="p-5 rounded-3xl bg-white/60 backdrop-blur-xl border border-white shadow-xl flex flex-wrap gap-4 items-end relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 bg-gradient-to-b from-brand-400 to-purple-400 h-full rounded-l-3xl"></div>
                <div className="space-y-1.5 flex-1 min-w-[200px]">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Start Date</label>
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <Calendar className="h-4 w-4 text-slate-400 group-focus-within:text-brand-500 transition-colors" />
                        </div>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-white/80 border-none ring-1 ring-slate-200/60 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-brand-500/50 shadow-inner transition-all hover:bg-white"
                        />
                    </div>
                </div>
                <div className="space-y-1.5 flex-1 min-w-[200px]">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">End Date</label>
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <Calendar className="h-4 w-4 text-slate-400 group-focus-within:text-brand-500 transition-colors" />
                        </div>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-white/80 border-none ring-1 ring-slate-200/60 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-brand-500/50 shadow-inner transition-all hover:bg-white"
                        />
                    </div>
                </div>
                <button 
                    onClick={() => { setStartDate(''); setEndDate(''); }}
                    className="p-3 bg-slate-900 text-white hover:bg-brand-600 rounded-2xl transition-all font-bold text-sm shadow-md hover:shadow-lg active:scale-95 group"
                    title="Clear Filters"
                >
                    <RefreshCw className="h-5 w-5 group-hover:rotate-180 transition-transform duration-500" />
                </button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {stats.map((stat, idx) => (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1, type: "spring", stiffness: 100 }}
                        key={idx}
                    >
                        <Card className="px-6 py-5 border-none ring-1 ring-slate-100 hover:ring-brand-200 transition-all bg-white relative overflow-hidden group shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] rounded-3xl cursor-default">
                            <div className="flex items-start justify-between relative z-10">
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{stat.label}</p>
                                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                                        {loading ? (
                                            <div className="h-8 w-24 bg-slate-100 rounded-lg animate-pulse mt-1"></div>
                                        ) : stat.value}
                                    </h3>
                                </div>
                                <div className={cn("p-3 rounded-2xl transition-all duration-500 group-hover:rotate-12 group-hover:scale-110", stat.bg, stat.glow)}>
                                    <stat.icon className={cn("h-6 w-6", stat.color)} />
                                </div>
                            </div>
                            <div className="absolute -right-8 -bottom-8 opacity-[0.02] group-hover:opacity-[0.05] group-hover:scale-125 transition-all duration-700">
                                <stat.icon className="h-40 w-40" />
                            </div>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {/* Tax Breakdown Table */}
            <Card className="border-none shadow-2xl ring-1 ring-slate-100/50 overflow-hidden bg-white rounded-[32px]">
                <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between bg-gradient-to-r from-slate-50/50 to-white">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-brand-50 rounded-2xl text-brand-600 shadow-inner">
                            <FileText className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-900 tracking-tight">Tax Breakdown</h2>
                            <p className="text-xs font-bold text-slate-500 mt-0.5 tracking-wide">Aggregated by GST Rate tiers based on items sold</p>
                        </div>
                    </div>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="min-w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/80 border-b border-slate-100">
                                <th className="ds-table-header-cell pl-8 py-4">GST Rate Tier</th>
                                <th className="ds-table-header-cell py-4">Volume (Items Sold)</th>
                                <th className="ds-table-header-cell py-4">Total Taxable Value</th>
                                <th className="ds-table-header-cell pr-8 py-4 text-right">Computed Tax</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                <tr>
                                    <td colSpan="4" className="px-6 py-16 text-center">
                                        <div className="inline-flex items-center justify-center p-4 bg-slate-50 rounded-full mb-4 shadow-inner">
                                            <RefreshCw className="h-8 w-8 animate-spin text-brand-500" />
                                        </div>
                                        <p className="text-sm font-black text-slate-500 uppercase tracking-widest">Crunching numbers...</p>
                                    </td>
                                </tr>
                            ) : data.breakdown && data.breakdown.length > 0 ? (
                                data.breakdown.map((row, i) => (
                                    <tr key={i} className="group hover:bg-brand-50/30 transition-colors">
                                        <td className="px-6 py-5 pl-8">
                                            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl bg-slate-900 text-white font-black text-xs shadow-md tracking-wider">
                                                GST {row.gstRate}%
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 font-bold text-slate-600">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm">{row.itemsSold}</span>
                                                <span className="text-[10px] text-slate-400 uppercase font-black">units</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <span className="font-black text-slate-900 text-base">
                                                ₹{(row.totalTaxableValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </span>
                                        </td>
                                        <td className="px-6 py-5 pr-8 text-right">
                                            <span className="font-black text-brand-600 text-lg tracking-tight">
                                                ₹{(row.calculatedTax || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="4" className="px-6 py-16 text-center">
                                        <div className="inline-flex items-center justify-center p-4 bg-slate-50 rounded-full mb-4">
                                            <AlertCircle className="h-8 w-8 text-slate-300" />
                                        </div>
                                        <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No tax data found for the selected period.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        {!loading && data.breakdown && data.breakdown.length > 0 && (
                            <tfoot className="bg-slate-900 text-white">
                                <tr>
                                    <td className="px-6 py-5 pl-8 font-black tracking-widest uppercase text-xs text-slate-400">Grand Total</td>
                                    <td className="px-6 py-5 font-black text-white text-base">
                                        {data.breakdown.reduce((sum, item) => sum + item.itemsSold, 0)} <span className="text-[10px] text-slate-400 font-bold uppercase ml-1">units</span>
                                    </td>
                                    <td className="px-6 py-5 font-black text-white text-base">
                                        ₹{data.breakdown.reduce((sum, item) => sum + (item.totalTaxableValue || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-6 py-5 pr-8 text-right font-black text-brand-400 text-xl tracking-tight">
                                        ₹{data.breakdown.reduce((sum, item) => sum + (item.calculatedTax || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default TaxStatements;
