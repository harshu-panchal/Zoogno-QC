import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';
import Card from '@shared/components/ui/Card';
import PageHeader from '@shared/components/ui/PageHeader';
import Pagination from '@shared/components/ui/Pagination';
import { getBasketStatusConfig } from '@shared/utils/basketUtils';
import { adminBasketsApi } from '../services/api/basketApi';
import { toast } from 'sonner';
import {
    Search, ShoppingBasket, Eye, Ban, CheckCircle2, Filter,
    RefreshCw, Loader2, TrendingDown, X, AlertTriangle, Package,
    UserCheck, Clock, QrCode, Download
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateBagQRDataURL } from '@shared/utils/qrBagUtils';

import BasketHistoryModal from '../components/BasketHistoryModal';

const BasketDashboard = () => {
    const [baskets, setBaskets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [selectedBasket, setSelectedBasket] = useState(null);
    const [statsData, setStatsData] = useState({ total: 0, available: 0, assigned: 0, lost: 0, damaged: 0 });
    const PAGE_SIZE = 20;

    const fetchBaskets = async () => {
        setLoading(true);
        try {
            const res = await adminBasketsApi.getInventory({
                page,
                limit: PAGE_SIZE,
                status: statusFilter !== 'ALL' ? statusFilter : undefined,
                search: search || undefined,
            });
            const payload = res.data?.result || {};
            if (Array.isArray(payload.items)) {
                setBaskets(payload.items);
                setTotal(payload.total || 0);
            } else {
                throw new Error('no data');
            }
        } catch (err) {
            console.error("Failed to fetch basket inventory:", err);
            toast.error("Failed to load basket inventory");
            setBaskets([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const res = await adminBasketsApi.getStats();
            const data = res.data?.result || {};
            setStatsData({
                total: data.total || 0,
                available: data.available || 0,
                assigned: data.assigned || 0,
                lost: data.lost || 0,
                damaged: data.damaged || 0,
            });
        } catch {
            // Stats might not be available — calculate from local data as fallback
        }
    };

    useEffect(() => {
        fetchBaskets();
        fetchStats();
    }, [page, statusFilter]); // eslint-disable-line

    useEffect(() => {
        const t = setTimeout(() => { setPage(1); fetchBaskets(); }, 400);
        return () => clearTimeout(t);
    }, [search]); // eslint-disable-line

    // Fallback stats from current page (if stats endpoint unavailable)
    const stats = useMemo(() => {
        if (statsData.total > 0) return statsData;
        return {
            total: total || 0,
            available: baskets.filter(b => b.status === 'AVAILABLE').length,
            assigned: baskets.filter(b => b.status === 'ASSIGNED').length,
            lost: baskets.filter(b => b.status === 'LOST').length,
            damaged: baskets.filter(b => b.status === 'DAMAGED').length,
        };
    }, [baskets, total, statsData]);

    const handleDisable = async (basketId) => {
        try {
            await adminBasketsApi.disableBasket(basketId);
            toast.success('Basket disabled');
            fetchBaskets();
            fetchStats();
        } catch {
            toast.error('Failed to disable basket');
        }
    };

    const handleBulkDownloadQR = async () => {
        if (baskets.length === 0) return toast.error("No baskets to download");
        toast.success(`Generating PDF for ${baskets.length} baskets on this page…`);
        
        try {
            const pdf = new jsPDF('p', 'mm', 'a4');
            const cols = 3;
            const rows = 5;
            const qrSize = 40;
            const marginX = 20;
            const marginY = 20;
            const gapX = (210 - 2 * marginX - cols * qrSize) / (cols - 1);
            const gapY = (297 - 2 * marginY - rows * (qrSize + 10)) / (rows - 1);

            for (let i = 0; i < baskets.length; i++) {
                const bag = baskets[i];
                const dataUrl = await generateBagQRDataURL(bag.basketId);
                
                if (i > 0 && i % (cols * rows) === 0) {
                    pdf.addPage();
                }

                const pageIndex = i % (cols * rows);
                const col = pageIndex % cols;
                const row = Math.floor(pageIndex / cols);

                const x = marginX + col * (qrSize + gapX);
                const y = marginY + row * (qrSize + gapY + 10);

                pdf.addImage(dataUrl, 'PNG', x, y, qrSize, qrSize);
                pdf.setFontSize(9);
                pdf.setFont("helvetica", "bold");
                pdf.text(bag.basketId, x + (qrSize / 2), y + qrSize + 5, { align: 'center' });
            }

            pdf.save(`zoognu-baskets-page${page}-${Date.now()}.pdf`);
        } catch (error) {
            console.error("QR Download Error:", error);
            toast.error("Failed to generate QR PDF");
        }
    };

    return (
        <div className="space-y-6 pb-16">
            <PageHeader
                title="Basket Management"
                description="Track reusable baskets for bulky orders across their full lifecycle."
                actions={
                    <div className="flex items-center gap-2">
                        <button onClick={handleBulkDownloadQR} disabled={baskets.length === 0} className="flex items-center gap-2 text-xs font-black bg-[#116A29] hover:bg-[#0e5621] text-white px-4 py-2 rounded-xl transition-colors disabled:opacity-50">
                            <Download size={13} />DOWNLOAD PAGE QRs
                        </button>
                        <button onClick={() => { fetchBaskets(); fetchStats(); }} className="flex items-center gap-2 text-xs font-black border border-slate-200 bg-white px-4 py-2 rounded-xl hover:bg-slate-50 transition-colors">
                            <RefreshCw size={13} />REFRESH
                        </button>
                    </div>
                }
            />

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                    { label: 'Total Baskets', value: stats.total, icon: ShoppingBasket, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                    { label: 'Available', value: stats.available, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: 'Assigned', value: stats.assigned, icon: UserCheck, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { label: 'Lost', value: stats.lost, icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50' },
                    { label: 'Damaged', value: stats.damaged, icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50' },
                ].map((stat) => (
                    <Card key={stat.label} className="border-none shadow-sm ring-1 ring-slate-100 p-4">
                        <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center mb-3', stat.bg)}>
                            <stat.icon size={18} className={stat.color} />
                        </div>
                        <p className="text-2xl font-black text-slate-900">{stat.value}</p>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-0.5">{stat.label}</p>
                    </Card>
                ))}
            </div>

            <Card className="border-none shadow-sm ring-1 ring-slate-100">
                {/* Filter bar */}
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search basket ID or order ID…"
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                        <Filter size={14} className="text-slate-400 shrink-0" />
                        {['ALL', 'AVAILABLE', 'ASSIGNED', 'IN_USE', 'PACKED', 'DELIVERED', 'RETURNED', 'LOST', 'DAMAGED', 'DISABLED'].map((s) => (
                            <button
                                key={s}
                                onClick={() => { setStatusFilter(s); setPage(1); }}
                                className={cn(
                                    'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase whitespace-nowrap transition-all',
                                    statusFilter === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                )}
                            >
                                {s.replace('_', ' ')}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-24">
                            <Loader2 size={32} className="text-indigo-500 animate-spin" />
                        </div>
                    ) : baskets.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                            <ShoppingBasket size={40} className="mb-3" />
                            <p className="text-sm font-bold">No baskets found</p>
                            <p className="text-xs mt-1">Try adjusting your filters or create new baskets</p>
                        </div>
                    ) : (
                        <table className="w-full text-left min-w-[700px]">
                            <thead>
                                <tr className="bg-slate-50/60 border-b border-slate-100">
                                    {['Basket ID', 'Status', 'Size', 'Seller', 'Order', 'Last Scan', 'Reuse', 'Created', 'Actions'].map((h) => (
                                        <th key={h} className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {baskets.map((basket) => {
                                    const cfg = getBasketStatusConfig(basket.status);
                                    return (
                                        <tr key={basket._id} className="hover:bg-slate-50/60 group">
                                            <td className="px-4 py-3 font-black text-xs text-slate-900 font-mono">{basket.basketId}</td>
                                            <td className="px-4 py-3">
                                                <span className={cn('px-2.5 py-1 rounded-full text-[10px] font-black uppercase', cfg.badge)}>{cfg.label}</span>
                                            </td>
                                            <td className="px-4 py-3 text-xs font-bold text-slate-700">{basket.size || '—'}</td>
                                            <td className="px-4 py-3 text-xs font-semibold text-slate-600">{basket.seller?.name || <span className="text-slate-300">Unassigned</span>}</td>
                                            <td className="px-4 py-3 text-xs font-semibold text-indigo-600">{basket.orderId || <span className="text-slate-300">—</span>}</td>
                                            <td className="px-4 py-3 text-xs font-medium text-slate-500">
                                                {basket.lastScan ? new Date(basket.lastScan).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : <span className="text-slate-300">Never</span>}
                                            </td>
                                            <td className="px-4 py-3 text-xs font-black text-indigo-600">{basket.reuseCount || 0}</td>
                                            <td className="px-4 py-3 text-xs font-medium text-slate-500">
                                                {new Date(basket.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1.5">
                                                    <button onClick={() => setSelectedBasket(basket)} className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100" title="View Details">
                                                        <Eye size={13} />
                                                    </button>
                                                    {basket.status !== 'DISABLED' && basket.status !== 'LOST' && basket.status !== 'DAMAGED' && (
                                                        <button onClick={() => handleDisable(basket.basketId)} className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100" title="Disable">
                                                            <Ban size={13} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {total > PAGE_SIZE && (
                    <div className="p-4 border-t border-slate-50">
                        <Pagination page={page} totalPages={Math.ceil(total / PAGE_SIZE)} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
                    </div>
                )}
            </Card>

            {/* View Detail Modal */}
            {selectedBasket && (
                <BasketHistoryModal 
                    basket={selectedBasket} 
                    onClose={() => setSelectedBasket(null)} 
                />
            )}
        </div>
    );
};

export default BasketDashboard;
