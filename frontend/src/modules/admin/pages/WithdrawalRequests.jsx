import React, { useState, useMemo, useEffect } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import Modal from '@shared/components/ui/Modal';
import {
    Banknote,
    Clock,
    CheckCircle2,
    XCircle,
    Search,
    Filter,
    ChevronRight,
    Building2,
    Truck,
    ArrowUpRight,
    CreditCard,
    MoreVertical,
    Download,
    Eye,
    CheckCircle,
    FileText,
    AlertCircle,
    RotateCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import Pagination from '@shared/components/ui/Pagination';
import { adminApi } from "../services/adminApi";
import { toast } from "sonner";

const WithdrawalRequests = () => {
    const [activeTab, setActiveTab] = useState('sellers');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterPeriod, setFilterPeriod] = useState('all'); // all, today, this_week, last_week, this_month
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [loading, setLoading] = useState(true);
    const [actionModal, setActionModal] = useState({ isOpen: false, type: null, request: null });

    const [sellerRequests, setSellerRequests] = useState([]);
    const [deliveryRequests, setDeliveryRequests] = useState([]);
    const [sellerPage, setSellerPage] = useState(1);
    const [deliveryPage, setDeliveryPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [sellerTotal, setSellerTotal] = useState(0);
    const [deliveryTotal, setDeliveryTotal] = useState(0);

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

    const fetchData = async (sellerPageNum = 1, deliveryPageNum = 1) => {
        try {
            setLoading(true);
            const commonParams = { page: 1, limit: pageSize };
            if (searchTerm.trim()) commonParams.search = searchTerm.trim();
            if (filterStatus !== 'all') commonParams.status = filterStatus;
            if (filterPeriod !== 'all') commonParams.period = filterPeriod;

            const [sellerRes, deliveryRes] = await Promise.all([
                adminApi.getSellerWithdrawals({ ...commonParams, page: sellerPageNum }).catch(err => ({ data: { success: false, result: {} } })),
                adminApi.getDeliveryWithdrawals({ ...commonParams, page: deliveryPageNum }).catch(err => ({ data: { success: false, result: {} } }))
            ]);

            if (sellerRes.data.success) {
                const payload = sellerRes.data.result || {};
                const items = Array.isArray(payload.items) ? payload.items : (sellerRes.data.results || []);
                setSellerRequests(items);
                setSellerTotal(typeof payload.total === 'number' ? payload.total : items.length);
                setSellerPage(typeof payload.page === 'number' ? payload.page : sellerPageNum);
            }
            if (deliveryRes.data.success) {
                const payload = deliveryRes.data.result || {};
                const items = Array.isArray(payload.items) ? payload.items : (deliveryRes.data.results || []);
                setDeliveryRequests(items);
                setDeliveryTotal(typeof payload.total === 'number' ? payload.total : items.length);
                setDeliveryPage(typeof payload.page === 'number' ? payload.page : deliveryPageNum);
            }
        } catch (error) {
            console.error("Fetch error:", error);
            toast.error("Failed to fetch requests");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchData(1, 1);
        }, 500);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageSize, searchTerm, filterStatus, filterPeriod]);

    const fetchSellerPage = (p) => {
        fetchData(p, deliveryPage);
        setSellerPage(p);
    };
    const fetchDeliveryPage = (p) => {
        fetchData(sellerPage, p);
        setDeliveryPage(p);
    };

    const stats = useMemo(() => {
        const sData = Array.isArray(sellerRequests) ? sellerRequests : [];
        const dData = Array.isArray(deliveryRequests) ? deliveryRequests : [];

        return {
            sellers: {
                pending: sData.filter(r => r.status === 'Pending' || r.status === 'Processing').length,
                amount: Math.abs(sData.filter(r => r.status === 'Pending' || r.status === 'Processing').reduce((acc, r) => acc + (Number(r.amount) || 0), 0)),
                processed: sData.filter(r => r.status === 'Settled').length,
                totalAmount: Math.abs(sData.reduce((acc, r) => acc + (Number(r.amount) || 0), 0)),
            },
            delivery: {
                pending: dData.filter(r => r.status === 'Pending' || r.status === 'Processing').length,
                amount: Math.abs(dData.filter(r => r.status === 'Pending' || r.status === 'Processing').reduce((acc, r) => acc + (Number(r.amount) || 0), 0)),
                processed: dData.filter(r => r.status === 'Settled').length,
                totalAmount: Math.abs(dData.reduce((acc, r) => acc + (Number(r.amount) || 0), 0)),
            }
        };
    }, [sellerRequests, deliveryRequests]);

    const currentData = useMemo(() => {
        const data = activeTab === 'sellers' ? (sellerRequests || []) : (deliveryRequests || []);
        return data.filter(r => {
            const name = r.user?.shopName || r.user?.name || "";
            const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                r._id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (r.reference && r.reference.toLowerCase().includes(searchTerm.toLowerCase()));
            const matchesStatus = filterStatus === 'all' || r.status?.toLowerCase() === filterStatus.toLowerCase();
            return matchesSearch && matchesStatus;
        });
    }, [activeTab, sellerRequests, deliveryRequests, searchTerm, filterStatus]);

    const exportToCSV = () => {
        const data = currentData;
        if (!data.length) {
            toast.error("No withdrawal requests found to export");
            return;
        }

        const headers = ["Transaction ID", "Requester Name", "Role", "Phone", "Account Number", "IFSC Code", "UPI ID", "Amount (INR)", "Status", "Request Date"];
        const rows = data.map(r => {
            const user = r.user || {};
            const role = activeTab === 'sellers' ? 'Seller' : 'Delivery Partner';
            const name = user.shopName ? `${user.name || ''} (${user.shopName})` : (user.name || "N/A");
            const phone = user.phone || "N/A";
            const accNo = user.bankDetails?.accountNumber || user.accountNumber || "N/A";
            const ifsc = user.bankDetails?.ifscCode || user.ifsc || "N/A";
            const upi = user.upiDetails?.upiId || user.upiId || "N/A";
            const amount = Math.abs(r.amount || 0);
            const status = r.status || "Pending";
            const date = r.createdAt ? new Date(r.createdAt).toLocaleString('en-IN') : "N/A";
            return [
                `"${r.reference || r._id}"`,
                `"${name}"`,
                `"${role}"`,
                `"${phone}"`,
                `"${accNo}"`,
                `"${ifsc}"`,
                `"${upi}"`,
                amount,
                `"${status}"`,
                `"${date}"`
            ].join(",");
        });

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Withdrawals_${activeTab}_${filterPeriod}_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(`Exported ${data.length} records to CSV`);
    };

    const handleAction = (type, request) => {
        setActionModal({ isOpen: true, type, request });
    };

    const confirmAction = async () => {
        try {
            setLoading(true);
            const status = actionModal.type === 'approve' ? 'Settled' : 'Failed';
            const res = await adminApi.updateWithdrawalStatus(actionModal.request._id, { status });
            if (res.data.success) {
                toast.success(`Request ${status} successfully`);
                fetchData(sellerPage, deliveryPage);
                setActionModal({ isOpen: false, type: null, request: null });
            }
        } catch (error) {
            toast.error("Action failed");
        } finally {
            setLoading(false);
        }
    };

    const activeStats = activeTab === 'sellers' ? stats.sellers : stats.delivery;

    return (
        <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-1">
                <div>
                    <h1 className="ds-h1 flex items-center gap-3">
                        Withdrawal Requests
                        <Badge variant="primary" className="text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider">Financial Hub</Badge>
                    </h1>
                    <p className="ds-description mt-1">Review and process fund disbursement requests from sellers and delivery partners.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => fetchData(sellerPage, deliveryPage)}
                        className="p-2.5 bg-white ring-1 ring-slate-200 text-slate-600 rounded-2xl hover:bg-slate-50 transition-all shadow-sm"
                        title="Refresh"
                    >
                        <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
                    </button>
                    <button
                        onClick={exportToCSV}
                        className="bg-[#116A29] hover:bg-[#0e5621] text-white rounded-lg font-bold uppercase shadow-md transition-all flex items-center justify-center gap-2 px-5 py-2.5 active:scale-95 text-sm"
                    >
                        <Download className="h-4 w-4" />
                        EXPORT CSV
                    </button>
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total Pending', value: stats.sellers.pending + stats.delivery.pending, icon: Clock, color: 'amber', bg: 'bg-amber-50', iconColor: 'text-amber-500' },
                    { label: 'Pending Volume', value: `₹${(stats.sellers.amount + stats.delivery.amount).toLocaleString()}`, icon: Banknote, color: 'blue', bg: 'bg-brand-50', iconColor: 'text-brand-500' },
                    { label: 'Settled Count', value: stats.sellers.processed + stats.delivery.processed, icon: CheckCircle2, color: 'emerald', bg: 'bg-emerald-50', iconColor: 'text-emerald-500' },
                    { label: `${filterPeriod === 'all' ? 'All Time' : filterPeriod === 'today' ? 'Today' : filterPeriod === 'this_week' ? 'This Week' : filterPeriod === 'last_week' ? 'Last Week' : 'This Month'} Volume`, value: `₹${(stats.sellers.totalAmount + stats.delivery.totalAmount).toLocaleString()}`, icon: CreditCard, color: 'purple', bg: 'bg-purple-50', iconColor: 'text-purple-500' },
                ].map((stat, i) => (
                    <Card key={i} className="p-4 border-none shadow-sm ring-1 ring-slate-100 bg-white">
                        <div className="flex items-center gap-4">
                            <div className={cn("p-3 rounded-2xl", stat.bg)}>
                                <stat.icon className={cn("h-6 w-6", stat.iconColor)} />
                            </div>
                            <div>
                                <p className="ds-label mb-1">{stat.label}</p>
                                <h3 className="ds-stat-medium">{stat.value}</h3>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            {/* Period Filter Bar */}
            <Card className="p-4 border-none shadow-sm ring-1 ring-slate-100 bg-white rounded-2xl">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mr-1">
                            <Filter className="h-3.5 w-3.5 text-brand-600" />
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
                            <Clock className="h-3.5 w-3.5 text-brand-600" />
                            <span>{getPeriodLabel(filterPeriod)}</span>
                        </div>
                        <div className="px-3 py-1.5 bg-brand-50 border border-brand-100 rounded-xl text-xs font-bold text-brand-700">
                            {activeTab === 'sellers' ? 'Seller' : 'Rider'} Total: ₹{activeStats.totalAmount.toLocaleString()}
                        </div>
                    </div>
                </div>
            </Card>

            {/* Main Interface Tab Structure */}
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
                            SELLER REQUESTS
                            <span className={cn(
                                "ml-1 px-2 py-0.5 rounded-full text-[10px]",
                                activeTab === 'sellers' ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-600"
                            )}>{sellerTotal || sellerRequests.length}</span>
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
                            <span className={cn(
                                "ml-1 px-2 py-0.5 rounded-full text-[10px]",
                                activeTab === 'delivery' ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-600"
                            )}>{deliveryTotal || deliveryRequests.length}</span>
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative group">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-brand-600 transition-colors" />
                            <input
                                type="text"
                                placeholder="Search by ID, Name, Ref..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 pr-4 py-2.5 bg-white ring-1 ring-slate-200 rounded-2xl text-xs font-semibold outline-none focus:ring-2 focus:ring-brand-500/20 w-64 transition-all"
                            />
                        </div>
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                            {['all', 'pending', 'settled'].map((status) => (
                                <button
                                    key={status}
                                    onClick={() => setFilterStatus(status)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-tight transition-all",
                                        filterStatus === status ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                                    )}
                                >
                                    {status}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Content Area */}
                <Card className="border-none shadow-2xl ring-1 ring-slate-100 overflow-hidden bg-white rounded-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50 border-b border-slate-100">
                                    <th className="ds-table-header-cell pl-8">Requester Details</th>
                                    <th className="ds-table-header-cell">Transaction ID</th>
                                    <th className="ds-table-header-cell text-center">Amount Requested</th>
                                    <th className="ds-table-header-cell">Gateway Status</th>
                                    <th className="ds-table-header-cell text-right pr-8">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {currentData.map((req, i) => (
                                    <tr key={req._id} className="group hover:bg-slate-50/30 transition-all">
                                        <td className="px-6 py-5 pl-8">
                                            <div className="flex items-center gap-4">
                                                <div className={cn(
                                                    "h-10 w-10 rounded-2xl flex items-center justify-center shadow-inner",
                                                    activeTab === 'sellers' ? "bg-brand-50 text-brand-600" : "bg-brand-50 text-brand-600"
                                                )}>
                                                    {activeTab === 'sellers' ? <Building2 className="h-6 w-6" /> : <Truck className="h-6 w-6" />}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-slate-900 group-hover:text-primary transition-colors cursor-pointer" onClick={() => setSelectedRequest(req)}>
                                                        {req.user?.shopName || req.user?.name || "Unknown"}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{req.user?.phone}</span>
                                                        <span className="h-1 w-1 rounded-full bg-slate-300" />
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{new Date(req.createdAt).toLocaleDateString()}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <span className="text-[10px] font-mono font-bold text-slate-500">{req.reference || req._id}</span>
                                        </td>
                                        <td className="px-6 py-5 text-center">
                                            <p className="text-sm font-black text-slate-900">₹{Math.abs(req.amount).toLocaleString()}</p>
                                        </td>
                                        <td className="px-6 py-5">
                                            <Badge
                                                variant={req.status === 'Pending' ? 'warning' : req.status === 'Settled' ? 'success' : req.status === 'Processing' ? 'primary' : 'danger'}
                                                className="text-[9px] font-black px-3 py-1 uppercase tracking-wider"
                                            >
                                                {req.status}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-5 text-right pr-8">
                                            <div className="flex items-center justify-end gap-2">
                                                {req.status === 'Pending' && (
                                                    <>
                                                        <button
                                                            onClick={() => handleAction('approve', req)}
                                                            className="p-2 bg-brand-50 text-brand-600 rounded-xl hover:bg-black  hover:text-white transition-all active:scale-90"
                                                        >
                                                            <CheckCircle className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleAction('reject', req)}
                                                            className="p-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-600 hover:text-white transition-all active:scale-90"
                                                        >
                                                            <XCircle className="h-4 w-4" />
                                                        </button>
                                                    </>
                                                )}
                                                <button
                                                    onClick={() => setSelectedRequest(req)}
                                                    className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:bg-slate-900 hover:text-white transition-all active:scale-90"
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {currentData.length === 0 && (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-20 text-center">
                                            <div className="flex flex-col items-center">
                                                <div className="p-4 bg-slate-50 rounded-full mb-4">
                                                    <FileText className="h-8 w-8 text-slate-200" />
                                                </div>
                                                <p className="text-slate-400 font-bold text-sm">No withdrawal requests found for this category.</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-6 py-3 border-t border-slate-100">
                        <Pagination
                            page={activeTab === 'sellers' ? sellerPage : deliveryPage}
                            totalPages={Math.ceil((activeTab === 'sellers' ? sellerTotal : deliveryTotal) / pageSize) || 1}
                            total={activeTab === 'sellers' ? sellerTotal : deliveryTotal}
                            pageSize={pageSize}
                            onPageChange={activeTab === 'sellers' ? fetchSellerPage : fetchDeliveryPage}
                            onPageSizeChange={(newSize) => {
                                setPageSize(newSize);
                                setSellerPage(1);
                                setDeliveryPage(1);
                            }}
                            loading={loading}
                        />
                    </div>
                </Card>
            </div>

            {/* Request Detail Modal */}
            <Modal
                isOpen={!!selectedRequest}
                onClose={() => setSelectedRequest(null)}
                title="Withdrawal Intel"
                size="md"
            >
                {selectedRequest && (
                    <div className="ds-section-spacing">
                        <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <div className={cn(
                                "h-20 w-20 rounded-xl flex items-center justify-center shadow-xl",
                                activeTab === 'sellers' ? "bg-black  text-primary-foreground" : "bg-black  text-primary-foreground"
                            )}>
                                {activeTab === 'sellers' ? <Building2 className="h-10 w-10" /> : <Truck className="h-10 w-10" />}
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-slate-900 tracking-tight">{selectedRequest.user?.shopName || selectedRequest.user?.name || "Unknown"}</h3>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">{selectedRequest._id}</p>
                                <div className="flex items-center gap-2 mt-3">
                                    <Badge variant={selectedRequest.status === 'Pending' ? 'warning' : 'success'}>
                                        {selectedRequest.status.toUpperCase()}
                                    </Badge>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Requested on {new Date(selectedRequest.createdAt).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            <Card className="p-5 border-none bg-slate-50 ring-1 ring-slate-100 rounded-xl">
                                <p className="ds-label mb-2">Request Amount</p>
                                <h4 className="text-2xl font-black text-slate-900">₹{Math.abs(selectedRequest.amount).toLocaleString()}</h4>
                                <p className="text-[10px] font-semibold text-slate-400 mt-1">Reference: {selectedRequest.reference}</p>
                            </Card>
                            {activeTab === 'sellers' && (
                                <Card className="p-5 border-none bg-slate-50 ring-1 ring-slate-100 rounded-xl">
                                    <p className="ds-label mb-2 border-b border-slate-200 pb-2">Transfer Destination</p>
                                    <div className="space-y-3 mt-3">
                                        {selectedRequest.user?.bankDetails?.accountNumber ? (
                                            <div className="grid grid-cols-2 gap-2 text-sm">
                                                <div>
                                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Bank Name</p>
                                                    <p className="font-semibold text-slate-900">{selectedRequest.user.bankDetails.bankName}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Account Type</p>
                                                    <p className="font-semibold text-slate-900">{selectedRequest.user.bankDetails.accountType}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Acc Holder Name</p>
                                                    <p className="font-semibold text-slate-900">{selectedRequest.user.bankDetails.accountHolderName}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Account No.</p>
                                                    <p className="font-semibold text-slate-900">{selectedRequest.user.bankDetails.accountNumber}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">IFSC</p>
                                                    <p className="font-semibold text-slate-900">{selectedRequest.user.bankDetails.ifscCode}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Cheque</p>
                                                    {selectedRequest.user.bankDetails.cancelledChequeImage ? (
                                                        <a href={selectedRequest.user.bankDetails.cancelledChequeImage} target="_blank" rel="noreferrer" className="text-brand-600 font-semibold hover:underline">View File</a>
                                                    ) : (
                                                        <span className="text-slate-400">N/A</span>
                                                    )}
                                                </div>
                                            </div>
                                        ) : selectedRequest.user?.upiDetails?.upiId ? (
                                            <div className="grid grid-cols-2 gap-2 text-sm">
                                                <div>
                                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">UPI ID</p>
                                                    <p className="font-semibold text-slate-900">{selectedRequest.user.upiDetails.upiId}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">QR Code</p>
                                                    {selectedRequest.user.upiDetails.qrCodeImage ? (
                                                        <a href={selectedRequest.user.upiDetails.qrCodeImage} target="_blank" rel="noreferrer" className="text-brand-600 font-semibold hover:underline">View QR</a>
                                                    ) : (
                                                        <span className="text-slate-400">N/A</span>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-sm text-slate-500 italic">No Bank or UPI details provided by the seller.</p>
                                        )}
                                    </div>
                                </Card>
                            )}
                            {activeTab === 'delivery' && (
                                <Card className="p-5 border-none bg-slate-50 ring-1 ring-slate-100 rounded-xl">
                                    <p className="ds-label mb-2 border-b border-slate-200 pb-2">Transfer Destination</p>
                                    <div className="space-y-3 mt-3">
                                        {selectedRequest.user?.accountNumber && selectedRequest.user?.ifsc ? (
                                            <div className="grid grid-cols-2 gap-2 text-sm">
                                                <div>
                                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Acc Holder Name</p>
                                                    <p className="font-semibold text-slate-900">{selectedRequest.user.accountHolder || "N/A"}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Account No.</p>
                                                    <p className="font-semibold text-slate-900">{selectedRequest.user.accountNumber}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">IFSC</p>
                                                    <p className="font-semibold text-slate-900">{selectedRequest.user.ifsc}</p>
                                                </div>
                                            </div>
                                        ) : selectedRequest.user?.upiId ? (
                                            <div className="grid grid-cols-2 gap-2 text-sm">
                                                <div>
                                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">UPI ID</p>
                                                    <p className="font-semibold text-slate-900">{selectedRequest.user.upiId}</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-sm text-slate-500 italic">No bank or UPI details on file for this rider — verify before authorizing.</p>
                                        )}
                                    </div>
                                </Card>
                            )}
                        </div>

                        <div className="flex gap-3 pt-2">
                            {selectedRequest.status === 'Pending' ? (
                                <>
                                    <button
                                        onClick={() => { setSelectedRequest(null); handleAction('approve', selectedRequest); }}
                                        className="flex-1 py-3 bg-black  hover:bg-brand-700 text-primary-foreground rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl shadow-brand-200 transition-all active:scale-[0.98]"
                                    >
                                        Authorize Transfer
                                    </button>
                                    <button
                                        onClick={() => { setSelectedRequest(null); handleAction('reject', selectedRequest); }}
                                        className="flex-1 py-3 bg-white ring-1 ring-slate-200 text-slate-600 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-slate-50 transition-all"
                                    >
                                        Deny Request
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={() => setSelectedRequest(null)}
                                    className="w-full py-3 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest"
                                >
                                    Close Intelligence
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </Modal>

            {/* Action Confirmation Modal */}
            <Modal
                isOpen={actionModal.isOpen}
                onClose={() => !loading && setActionModal({ isOpen: false, type: null, request: null })}
                title="Confirm Financial Action"
                size="sm"
            >
                {actionModal.request && (
                    <div className="text-center space-y-6">
                        <div className={cn(
                            "h-16 w-16 rounded-xl flex items-center justify-center mx-auto",
                            actionModal.type === 'approve' ? "bg-brand-50 text-brand-600" : "bg-rose-50 text-rose-600"
                        )}>
                            {actionModal.type === 'approve' ? <CheckCircle className="h-8 w-8" /> : <XCircle className="h-8 w-8" />}
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900">Are you sure?</h3>
                            <p className="text-sm font-medium text-slate-500 mt-2 px-6">
                                You are about to {actionModal.type === 'approve' ? 'approve' : 'reject'} the withdrawal request for <b className="text-slate-900">₹{Math.abs(actionModal.request.amount).toLocaleString()}</b>.
                            </p>
                        </div>
                        <div className="space-y-3">
                            <button
                                onClick={confirmAction}
                                disabled={loading}
                                className={cn(
                                    "w-full py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all shadow-xl flex items-center justify-center gap-2",
                                    actionModal.type === 'approve' ? "bg-black  hover:bg-brand-700 text-primary-foreground shadow-brand-100" : "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-100"
                                )}
                            >
                                {loading && <RotateCw className="h-4 w-4 animate-spin" />}
                                {loading ? 'PROCESSING...' : `YES, ${actionModal.type.toUpperCase()}`}
                            </button>
                            <button
                                onClick={() => setActionModal({ isOpen: false, type: null, request: null })}
                                disabled={loading}
                                className="w-full py-3 bg-slate-50 text-slate-400 font-black text-[11px] uppercase tracking-widest rounded-2xl hover:bg-slate-100 transition-all"
                            >
                                CANCEL
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default WithdrawalRequests;
