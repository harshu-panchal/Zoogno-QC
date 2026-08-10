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
    AlertCircle,
    UserCheck,
    MapPin,
    Hash
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

const Gstr1Report = () => {
    const [loading, setLoading] = useState(true);
    const [reportData, setReportData] = useState([]);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const fetchGstr1 = async () => {
        try {
            setLoading(true);
            const params = {};
            if (startDate) params.startDate = startDate;
            if (endDate) params.endDate = endDate;

            const res = await adminFinanceApi.getGstr1Report(params);
            if (res.data.success) {
                setReportData(res.data.results || []);
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to fetch GSTR-1 Report');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchGstr1();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startDate, endDate]);

    const handleExportCSV = () => {
        if (!reportData.length) {
            toast.error("No data to export");
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        // Header
        csvContent += "Invoice No,Invoice Date,Order ID,Customer Name,Customer GSTIN,Customer State,Place of Supply,Product Name,HSN/SAC,Quantity,Unit Price (INR),Taxable Value (INR),GST Rate (%),CGST (INR),SGST (INR),IGST (INR),Total GST (INR),Total Value (INR)\n";

        reportData.forEach(row => {
            const dateStr = new Date(row.invoiceDate).toLocaleDateString('en-IN');
            csvContent += `"${row.invoiceNo}","${dateStr}","${row.orderId}","${row.customerName}","${row.customerGstin}","${row.customerState}","${row.placeOfSupply}","${row.productName}","${row.hsnCode}",${row.quantity},${row.unitPrice},${row.taxableValue},${row.gstRate},${row.cgst},${row.sgst},${row.igst},${row.totalGst},${row.invoiceTotal}\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `gstr1_report_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success("CSV Exported successfully!");
    };

    const handleExportJSON = () => {
        if (!reportData.length) {
            toast.error("No data to export");
            return;
        }
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(reportData, null, 2));
        const link = document.createElement("a");
        link.setAttribute("href", dataStr);
        link.setAttribute("download", `gstr1_report_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success("JSON Exported successfully!");
    };

    // Calculate aggregated totals
    const totalTaxable = reportData.reduce((acc, row) => acc + (row.taxableValue || 0), 0);
    const totalCGST = reportData.reduce((acc, row) => acc + (row.cgst || 0), 0);
    const totalSGST = reportData.reduce((acc, row) => acc + (row.sgst || 0), 0);
    const totalIGST = reportData.reduce((acc, row) => acc + (row.igst || 0), 0);
    const grandTotal = reportData.reduce((acc, row) => acc + (row.invoiceTotal || 0), 0);

    const stats = [
        {
            label: 'Total Taxable Value',
            value: `₹${totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
            icon: FileText,
            color: 'text-indigo-600',
            bg: 'bg-indigo-50',
            glow: 'shadow-[0_0_15px_rgba(79,70,229,0.3)]',
        },
        {
            label: 'CGST Collected',
            value: `₹${totalCGST.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
            icon: TrendingUp,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
            glow: 'shadow-[0_0_15px_rgba(217,119,6,0.3)]',
        },
        {
            label: 'SGST Collected',
            value: `₹${totalSGST.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
            icon: TrendingUp,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
            glow: 'shadow-[0_0_15px_rgba(16,185,129,0.3)]',
        },
        {
            label: 'IGST Collected',
            value: `₹${totalIGST.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
            icon: TrendingUp,
            color: 'text-rose-600',
            bg: 'bg-rose-50',
            glow: 'shadow-[0_0_15px_rgba(225,29,72,0.3)]',
        }
    ];

    return (
        <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 duration-700 space-y-8">
            {/* Header */}
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
                          <span className="text-[10px] font-black tracking-widest text-white uppercase">Reports Hub</span>
                        </div>
                        <h1 className="text-4xl font-black text-white tracking-tight">GSTR-1 Tax Report</h1>
                        <p className="text-slate-400 font-medium mt-2 text-sm max-w-xl">
                            Invoice-level aggregation of GST-taxable sales, categorized by states, place of supply, and individual GST rates.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleExportCSV}
                            disabled={loading || !reportData.length}
                            className="bg-white hover:bg-slate-50 text-slate-900 rounded-xl font-black uppercase shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-all flex items-center justify-center gap-2 px-6 py-3 hover:scale-105 active:scale-95 text-xs tracking-wider disabled:opacity-50"
                        >
                            <Download className="h-4 w-4 text-brand-600" />
                            EXPORT CSV
                        </button>
                        <button
                            onClick={handleExportJSON}
                            disabled={loading || !reportData.length}
                            className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl font-black uppercase transition-all flex items-center justify-center gap-2 px-6 py-3 hover:scale-105 active:scale-95 text-xs tracking-wider disabled:opacity-50"
                        >
                            <Download className="h-4 w-4 text-brand-400" />
                            EXPORT JSON
                        </button>
                    </div>
                </div>
            </div>

            {/* Date Filters */}
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
                        </Card>
                    </motion.div>
                ))}
            </div>

            {/* Report Table */}
            <Card className="border-none shadow-2xl ring-1 ring-slate-100/50 overflow-hidden bg-white rounded-[32px]">
                <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between bg-gradient-to-r from-slate-50/50 to-white">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-brand-50 rounded-2xl text-brand-600 shadow-inner">
                            <FileText className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-900 tracking-tight">Invoice Details</h2>
                            <p className="text-xs font-bold text-slate-500 mt-0.5 tracking-wide">Breakdown of taxable sales transactions</p>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/80 border-b border-slate-100">
                                <th className="ds-table-header-cell pl-8 py-4 text-xs font-black uppercase text-slate-500 tracking-wider">Invoice No / Date</th>
                                <th className="ds-table-header-cell py-4 text-xs font-black uppercase text-slate-500 tracking-wider">Customer / GSTIN</th>
                                <th className="ds-table-header-cell py-4 text-xs font-black uppercase text-slate-500 tracking-wider">State / POS</th>
                                <th className="ds-table-header-cell py-4 text-xs font-black uppercase text-slate-500 tracking-wider">Product / HSN</th>
                                <th className="ds-table-header-cell py-4 text-xs font-black uppercase text-slate-500 tracking-wider">Qty / Price</th>
                                <th className="ds-table-header-cell py-4 text-xs font-black uppercase text-slate-500 tracking-wider">Taxable Val</th>
                                <th className="ds-table-header-cell py-4 text-xs font-black uppercase text-slate-500 tracking-wider text-center">Rate</th>
                                <th className="ds-table-header-cell py-4 text-xs font-black uppercase text-slate-500 tracking-wider">CGST / SGST</th>
                                <th className="ds-table-header-cell py-4 text-xs font-black uppercase text-slate-500 tracking-wider">IGST</th>
                                <th className="ds-table-header-cell pr-8 py-4 text-xs font-black uppercase text-slate-500 tracking-wider text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 text-sm">
                            {loading ? (
                                <tr>
                                    <td colSpan="10" className="px-6 py-16 text-center">
                                        <div className="inline-flex items-center justify-center p-4 bg-slate-50 rounded-full mb-4 shadow-inner">
                                            <RefreshCw className="h-8 w-8 animate-spin text-brand-500" />
                                        </div>
                                        <p className="text-sm font-black text-slate-500 uppercase tracking-widest">Compiling report data...</p>
                                    </td>
                                </tr>
                            ) : reportData.length > 0 ? (
                                reportData.map((row, i) => (
                                    <tr key={i} className="group hover:bg-brand-50/20 transition-colors">
                                        <td className="px-6 py-4 pl-8">
                                            <div className="font-bold text-slate-800">{row.invoiceNo}</div>
                                            <div className="text-[10px] text-slate-400 font-semibold">{new Date(row.invoiceDate).toLocaleDateString('en-IN')}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-slate-800 flex items-center gap-1">
                                                <UserCheck className="h-3 w-3 text-slate-400" /> {row.customerName}
                                            </div>
                                            {row.customerGstin && (
                                                <div className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                                                    <Hash className="h-3 w-3" /> {row.customerGstin}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-semibold text-slate-700 flex items-center gap-1">
                                                <MapPin className="h-3 w-3 text-slate-400" /> {row.customerState}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-slate-800 max-w-[150px] truncate" title={row.productName}>{row.productName}</div>
                                            <div className="text-[10px] text-slate-400 font-semibold">HSN: {row.hsnCode}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-semibold text-slate-700">{row.quantity} unit{row.quantity > 1 ? 's' : ''}</div>
                                            <div className="text-[10px] text-slate-400 font-semibold">@ ₹{row.unitPrice}</div>
                                        </td>
                                        <td className="px-6 py-4 font-bold text-slate-800">
                                            ₹{row.taxableValue.toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-bold">
                                                {row.gstRate}%
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {row.cgst > 0 || row.sgst > 0 ? (
                                                <>
                                                    <div className="text-slate-600 text-xs font-semibold">C: ₹{row.cgst.toFixed(2)}</div>
                                                    <div className="text-slate-600 text-xs font-semibold">S: ₹{row.sgst.toFixed(2)}</div>
                                                </>
                                            ) : (
                                                <span className="text-slate-300">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {row.igst > 0 ? (
                                                <span className="text-slate-800 font-semibold">₹{row.igst.toFixed(2)}</span>
                                            ) : (
                                                <span className="text-slate-300">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 pr-8 text-right font-black text-slate-900 text-base">
                                            ₹{row.invoiceTotal.toFixed(2)}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="10" className="px-6 py-16 text-center">
                                        <div className="inline-flex items-center justify-center p-4 bg-slate-50 rounded-full mb-4">
                                            <AlertCircle className="h-8 w-8 text-slate-300" />
                                        </div>
                                        <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No invoice records found.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        {!loading && reportData.length > 0 && (
                            <tfoot className="bg-slate-900 text-white font-black">
                                <tr>
                                    <td colSpan="5" className="px-6 py-5 pl-8 uppercase text-xs text-slate-400 tracking-wider">Report Grand Total</td>
                                    <td className="px-6 py-5 text-base">
                                        ₹{totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td></td>
                                    <td className="px-6 py-5 text-xs text-slate-300">
                                        C: ₹{totalCGST.toLocaleString('en-IN', { minimumFractionDigits: 2 })}<br/>
                                        S: ₹{totalSGST.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-6 py-5 text-base">
                                        ₹{totalIGST.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-6 py-5 pr-8 text-right text-brand-400 text-lg">
                                        ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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

export default Gstr1Report;
