import React, { useState, useMemo, useEffect, useRef } from 'react';
import Card from '@shared/components/ui/Card';
import Button from '@shared/components/ui/Button';
import Badge from '@shared/components/ui/Badge';
import Input from '@shared/components/ui/Input';
import {
    HiOutlineMagnifyingGlass,
    HiOutlineEye,
    HiOutlinePrinter,
    HiOutlineCheck,
    HiOutlineXMark,
    HiOutlineTruck,
    HiOutlineBanknotes,
    HiOutlineClock,
    HiOutlineArchiveBoxXMark,
    HiOutlineChartBar,
    HiOutlineChevronDown,
    HiOutlineChevronRight,
    HiOutlineInboxStack,
    HiOutlineMapPin,
    HiOutlinePhone,
    HiOutlineCalendarDays,
    HiOutlineQrCode,
    HiOutlineArchiveBox,
    HiOutlineDocumentText
} from 'react-icons/hi2';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// Orders Page

import { MagicCard } from '@/components/ui/magic-card';
import { BlurFade } from '@/components/ui/blur-fade';

import { sellerApi } from '../services/sellerApi';
import { useToast } from '@shared/components/ui/Toast';
import { getLegacyStatusFromOrder } from '@/shared/utils/orderStatus';
import { Loader2 } from 'lucide-react';
import Pagination from '@shared/components/ui/Pagination';
import { DatePicker } from "@/components/ui/date-picker";
import { getOrderStatusVariant } from '../components/orders';
import OrderBagScannerModal from '../components/OrderBagScannerModal';
import BagManualSelectModal from '../components/BagManualSelectModal';
import OrderBasketScannerModal from '../components/OrderBasketScannerModal';
import BasketManualSelectModal from '../components/BasketManualSelectModal';
import { generateInvoicePdf } from '@/shared/utils/invoiceGenerator';
import { generateAdminInvoicePdf } from '@/shared/utils/adminInvoiceGenerator';
import { useSettings } from '@core/context/SettingsContext';
import { generateBagQRDataURL } from '@/shared/utils/qrBagUtils';
import { createPortal } from 'react-dom';

const STATUS_OPTIONS = [
    { value: 'pending', label: 'Pending' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'packed', label: 'Packed' },
    { value: 'out_for_delivery', label: 'Out for Delivery' },
    { value: 'delivered', label: 'Delivered' },
    { value: 'cancelled', label: 'Cancelled' }
];

const StatusDropdown = ({ value, onChange, variant = 'default' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = STATUS_OPTIONS.find(opt => opt.value === (value || '').toLowerCase()) || STATUS_OPTIONS[0];
    const statusColor = getOrderStatusVariant(value);

    const colorClasses = 
        statusColor === 'warning' ? "bg-amber-100 text-amber-700 hover:bg-amber-200/80" :
        statusColor === 'info' ? "bg-brand-100 text-brand-700 hover:bg-brand-200/80" :
        statusColor === 'primary' ? "bg-brand-100 text-brand-700 hover:bg-brand-200/80" :
        statusColor === 'secondary' ? "bg-purple-100 text-purple-700 hover:bg-purple-200/80" :
        statusColor === 'success' ? "bg-brand-100 text-brand-700 hover:bg-brand-200/80" :
        statusColor === 'error' ? "bg-rose-100 text-rose-700 hover:bg-rose-200/80" :
        "bg-slate-100 text-slate-700 hover:bg-slate-200/80";

    const baseClasses = variant === 'modal' 
        ? "w-full text-[10px] pl-3 pr-8 py-2 rounded-xl font-black uppercase tracking-wider transition-all shadow-sm outline-none"
        : variant === 'table'
        ? "w-full text-[10px] pl-3 pr-8 py-1.5 rounded-full font-black uppercase tracking-widest transition-all shadow-sm outline-none"
        : "w-full min-w-[100px] text-[10px] pl-2 pr-6 py-1.5 rounded-lg font-black uppercase transition-all outline-none";

    return (
        <div className="relative inline-block w-full" ref={dropdownRef} onClick={(e) => e.stopPropagation()}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={cn("flex items-center justify-between border border-transparent w-full", baseClasses, colorClasses)}
            >
                <span className="truncate">
                    {variant === 'table' ? (selectedOption.value === 'out_for_delivery' ? 'Out for Delivery' : selectedOption.label) : 
                     variant === 'modal' ? selectedOption.label :
                     (selectedOption.value === 'out_for_delivery' ? 'Out' : selectedOption.label)}
                </span>
                <HiOutlineChevronDown className={cn("absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 opacity-60 transition-transform duration-200 shrink-0", isOpen && "rotate-180")} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -5, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -5, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className={cn(
                            "absolute z-[9999] mt-1 w-40 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden py-1",
                            variant === 'modal' ? "bottom-full mb-1 right-0" : "top-full right-0"
                        )}
                    >
                        {STATUS_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onChange(option.value);
                                    setIsOpen(false);
                                }}
                                className={cn(
                                    "w-full text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
                                    (value || '').toLowerCase() === option.value 
                                        ? "bg-primary/5 text-primary" 
                                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                )}
                            >
                                {option.label}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const Orders = () => {
    const { settings } = useSettings();
    const [orders, setOrders] = useState([]);
    const [summary, setSummary] = useState({
        totalOrders: 0,
        totalAmount: 0,
        pending: 0,
        confirmed: 0,
        packed: 0,
        outForDelivery: 0,
        delivered: 0,
        cancelled: 0,
        returned: 0,
        activeOrders: 0,
    });
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [isQuickViewModalOpen, setIsQuickViewModalOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [linkedBag, setLinkedBag] = useState(null);
    const [bagLoading, setBagLoading] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [isManualSelectOpen, setIsManualSelectOpen] = useState(false);
    const [linkedBasket, setLinkedBasket] = useState(null);
    const [basketLoading, setBasketLoading] = useState(false);
    const [isBasketScannerOpen, setIsBasketScannerOpen] = useState(false);
    const [isBasketManualSelectOpen, setIsBasketManualSelectOpen] = useState(false);
    const [linkedBagQrUrl, setLinkedBagQrUrl] = useState(null);
    const [linkedBasketQrUrl, setLinkedBasketQrUrl] = useState(null);
    const [isPackSelectionModalOpen, setIsPackSelectionModalOpen] = useState(false);

    useEffect(() => {
        if (linkedBag) {
            generateBagQRDataURL(linkedBag).then(setLinkedBagQrUrl).catch(() => setLinkedBagQrUrl(null));
        } else {
            setLinkedBagQrUrl(null);
        }
    }, [linkedBag]);

    useEffect(() => {
        if (linkedBasket) {
            generateBagQRDataURL(linkedBasket).then(setLinkedBasketQrUrl).catch(() => setLinkedBasketQrUrl(null));
        } else {
            setLinkedBasketQrUrl(null);
        }
    }, [linkedBasket]);

    const { showToast } = useToast();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [total, setTotal] = useState(0);
    const hasMountedRef = useRef(false);

    // Initial load: show full-page loader once
    useEffect(() => {
        fetchOrders(page, true).finally(() => {
            hasMountedRef.current = true;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Subsequent changes (page, date filters): update data without full page "refresh"
    useEffect(() => {
        if (!hasMountedRef.current) return;
        fetchOrders(page, false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, startDate, endDate]);

    // Prevent background scrolling when any modal is open
    useEffect(() => {
        const hasOpenModal = isDetailsModalOpen || isQuickViewModalOpen || isScannerOpen || isManualSelectOpen || isBasketScannerOpen || isBasketManualSelectOpen || isPackSelectionModalOpen;
        if (hasOpenModal) {
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';
            document.body.classList.add('overflow-hidden');
            if (window.lenis) window.lenis.stop();
        } else {
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
            document.body.classList.remove('overflow-hidden');
            if (window.lenis) window.lenis.start();
        }
        return () => {
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
            document.body.classList.remove('overflow-hidden');
            if (window.lenis) window.lenis.start();
        };
    }, [isDetailsModalOpen, isQuickViewModalOpen, isScannerOpen, isManualSelectOpen]);

    const fetchOrders = async (requestedPage = 1, showPageLoader = false) => {
        try {
            if (showPageLoader) {
                setLoading(true);
            }
            const params = { page: requestedPage };
            if (startDate) params.startDate = startDate;
            if (endDate) params.endDate = endDate;

            const response = await sellerApi.getOrders(params);

            // Backend returns handleResponse(..., { items, page, limit, total, totalPages })
            const payload = response.data.result || {};
            const rawOrders = Array.isArray(payload.items)
                ? payload.items
                : (response.data.results || []);

            const formattedOrders = (rawOrders || []).map(order => ({
                id: order.orderId,
                _id: order._id,
                customer: {
                    name: order.customer?.name || 'Unknown',
                    phone: order.customer?.phone || '',
                    avatar: (order.customer?.name || 'U').charAt(0)
                },
                items: (order.items || []).map(item => ({
                    name: item.name,
                    price: item.price,
                    qty: item.quantity,
                    image: item.image
                })),
                total: order.pricing?.total || 0,
                status: getLegacyStatusFromOrder(order),
                workflowStatus: order.workflowStatus,
                workflowVersion: order.workflowVersion,
                date: order.createdAt
                    ? new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                    : '',
                time: order.createdAt
                    ? new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                    : '',
                address: order.address
                    ? `${order.address.address || ''}, ${order.address.city || ''}`.trim()
                    : '',
                location: order.address?.location || null,
                payment: order.payment?.method === 'cash' || order.payment?.method === 'cod'
                    ? 'Cash on Delivery'
                    : order.payment?.method === 'wallet' ? 'Wallet' : 'Online Paid',
                seller: order.seller,
                pricing: order.pricing,
                bill: {
                    itemTotal: order.pricing?.itemTotal || 0,
                    tax: order.pricing?.taxTotal || 0,
                    grandTotal: order.pricing?.total || 0,
                }
            }));

            setOrders(formattedOrders);
            setSummary({
                totalOrders: Number(payload.summary?.totalOrders || payload.total || formattedOrders.length || 0),
                totalAmount: Number(payload.summary?.totalAmount || 0),
                pending: Number(payload.summary?.pending || 0),
                confirmed: Number(payload.summary?.confirmed || 0),
                packed: Number(payload.summary?.packed || 0),
                outForDelivery: Number(payload.summary?.outForDelivery || 0),
                delivered: Number(payload.summary?.delivered || 0),
                cancelled: Number(payload.summary?.cancelled || 0),
                returned: Number(payload.summary?.returned || 0),
                activeOrders: Number(payload.summary?.activeOrders || 0),
            });
            if (typeof payload.total === 'number') {
                setTotal(payload.total);
            } else {
                setTotal(formattedOrders.length);
            }
        } catch (error) {
            console.error("Failed to fetch orders:", error);
            showToast("Failed to fetch orders", "error");
        } finally {
            if (showPageLoader) {
                setLoading(false);
            }
        }
    };

    const tabs = ['All', 'Pending', 'Confirmed', 'Packed', 'Out for Delivery', 'Delivered', 'Cancelled'];
    const todayStr = new Date().toISOString().split('T')[0];

    const safeOrders = useMemo(
        () => (Array.isArray(orders) ? orders : []),
        [orders]
    );

    const filteredOrders = useMemo(() => {
        return safeOrders.filter(order => {
            const matchesSearch = order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                order.customer.name.toLowerCase().includes(searchTerm.toLowerCase());
            const statusToMatch = activeTab === 'Out for Delivery' ? 'out_for_delivery' : activeTab.toLowerCase();
            const matchesTab = activeTab === 'All' || order.status.toLowerCase() === statusToMatch;
            return matchesSearch && matchesTab;
        });
    }, [safeOrders, searchTerm, activeTab]);

    const stats = useMemo(() => [
        {
            label: 'Total Orders',
            value: summary.totalOrders,
            icon: HiOutlineArchiveBoxXMark,
            color: 'text-brand-600',
            bg: 'bg-brand-50'
        },
        {
            label: 'Pending',
            value: summary.pending,
            icon: HiOutlineClock,
            color: 'text-amber-600',
            bg: 'bg-amber-50'
        },
        {
            label: 'Confirmed',
            value: summary.confirmed,
            icon: HiOutlineCheck,
            color: 'text-brand-600',
            bg: 'bg-brand-50'
        },
        {
            label: 'Delivered',
            value: summary.delivered,
            icon: HiOutlineCheck,
            color: 'text-brand-600',
            bg: 'bg-brand-50'
        }
    ], [summary]);

    const getStatusColor = getOrderStatusVariant;

    const handleViewDetails = async (order) => {
        setSelectedOrder(order);
        setIsDetailsModalOpen(true);
        setBagLoading(true);
        setBasketLoading(true);
        try {
            const res = await sellerApi.getLabelData(order.id);
            if (res.data?.data?.bagId) {
                setLinkedBag(res.data.data.bagId);
            } else {
                setLinkedBag(null);
            }
            if (res.data?.data?.basketId) {
                setLinkedBasket(res.data.data.basketId);
            } else {
                setLinkedBasket(null);
            }
        } catch (e) {
            setLinkedBag(null);
            setLinkedBasket(null);
        } finally {
            setBagLoading(false);
            setBasketLoading(false);
        }
    };

    const handleLinkBag = async (bagId) => {
        if (!selectedOrder) return;
        try {
            await sellerApi.scanAndAttachBag({ bagId, orderId: selectedOrder.id || selectedOrder._id });
            showToast('Bag successfully linked to order', 'success');
            setLinkedBag(bagId);
            setIsScannerOpen(false);
            setIsManualSelectOpen(false);
            if (['pending', 'confirmed'].includes(selectedOrder.status.toLowerCase())) {
                setSelectedOrder(prev => ({ ...prev, status: 'packed' }));
                try {
                    await sellerApi.updateOrderStatus(selectedOrder.id || selectedOrder._id, { status: 'packed' });
                    setOrders(prevOrders => prevOrders.map(o => (o.id === (selectedOrder.id || selectedOrder._id) || o._id === (selectedOrder.id || selectedOrder._id)) ? { ...o, status: 'packed' } : o));
                } catch (err) {
                    console.error("Failed to auto-update status to packed:", err);
                }
            }
            await fetchOrders(); // Refresh order status if it changed
        } catch (error) {
            console.error("Failed to link bag:", error);
            showToast(error.response?.data?.message || 'Failed to link bag', 'error');
            setIsScannerOpen(false); // Close scanner on error so seller can read the toast
        }
    };

    const handleLinkBasket = async (basketId) => {
        if (!selectedOrder) return;
        try {
            await sellerApi.scanAndAttachBasket({ basketId, orderId: selectedOrder.id || selectedOrder._id });
            showToast('Basket successfully linked to order', 'success');
            setLinkedBasket(basketId);
            setIsBasketScannerOpen(false);
            setIsBasketManualSelectOpen(false);
            if (['pending', 'confirmed'].includes(selectedOrder.status.toLowerCase())) {
                setSelectedOrder(prev => ({ ...prev, status: 'packed' }));
                try {
                    await sellerApi.updateOrderStatus(selectedOrder.id || selectedOrder._id, { status: 'packed' });
                    setOrders(prevOrders => prevOrders.map(o => (o.id === (selectedOrder.id || selectedOrder._id) || o._id === (selectedOrder.id || selectedOrder._id)) ? { ...o, status: 'packed' } : o));
                } catch (err) {
                    console.error("Failed to auto-update status to packed:", err);
                }
            }
            await fetchOrders(); // Refresh order status if it changed
        } catch (error) {
            console.error("Failed to link basket:", error);
            showToast(error.response?.data?.message || 'Failed to link basket', 'error');
            setIsBasketScannerOpen(false); // Close scanner on error so seller can read the toast
        }
    };

    const handleStatusUpdate = async (orderId, newStatus) => {
        if (newStatus.toLowerCase() === 'packed') {
            const order = orders.find(o => o.id === orderId || o._id === orderId);
            if (order) {
                setSelectedOrder(order);
                setIsPackSelectionModalOpen(true);
            }
            return;
        }

        try {
            await sellerApi.updateOrderStatus(orderId, { status: newStatus.toLowerCase() });
            showToast(`Order status updated to ${newStatus}`, "success");
            fetchOrders(); // Refresh orders
            if (selectedOrder && (selectedOrder.id === orderId || selectedOrder._id === orderId)) {
                setSelectedOrder({ ...selectedOrder, status: newStatus });
            }
        } catch (error) {
            console.error("Failed to update status:", error);
            const errMsg = error.response?.data?.message || "Failed to update status";
            showToast(errMsg, "error");
        }
    };

    const exportOrders = () => {
        const data = filteredOrders;
        if (!data.length) {
            showToast("No orders to export", "warning");
            return;
        }
        const escapeCsv = (v) => {
            const s = String(v ?? "").replace(/"/g, '""');
            return /[",\n\r]/.test(s) ? `"${s}"` : s;
        };
        const headers = ["Order ID", "Customer", "Phone", "Date", "Time", "Total (₹)", "Status", "Address", "Payment"];
        const rows = data.map((o) => [
            o.id,
            o.customer?.name ?? "",
            o.customer?.phone ?? "",
            o.date,
            o.time,
            o.total,
            o.status,
            o.address ?? "",
            o.payment ?? "",
        ]);
        const csvContent = [
            headers.map(escapeCsv).join(","),
            ...rows.map((row) => row.map(escapeCsv).join(",")),
        ].join("\n");
        const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(`Exported ${data.length} order(s) as CSV`, "success");
    };

    const bulkPrintInvoices = async () => {
        if (!filteredOrders || filteredOrders.length === 0) {
            showToast("No orders to print", "warning");
            return;
        }
        try {
            showToast(`Generating invoices for ${filteredOrders.length} orders...`, "info");
            const { jsPDF } = await import('jspdf');
            const doc = new jsPDF();
            for (let i = 0; i < filteredOrders.length; i++) {
                const order = filteredOrders[i];
                if (i > 0) doc.addPage();

                // Seller Invoice
                await generateInvoicePdf(order, settings, true, doc, null, null);

                doc.addPage();

                // Admin Invoice
                await generateAdminInvoicePdf(order, settings, true, doc);
            }
            doc.save(`Bulk_Invoices_${new Date().toISOString().slice(0, 10)}.pdf`);
            showToast("Bulk invoices printed successfully", "success");
        } catch (error) {
            console.error("Failed to generate bulk invoices", error);
            showToast("Failed to generate bulk invoices", "error");
        }
    };

    return (
        <div className="space-y-4 sm:space-y-6 pb-20 sm:pb-16">
            <BlurFade delay={0.1}>
                {/* Page Header */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
                    <div className="min-w-0">
                        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 flex flex-wrap items-center gap-2">
                            Order Management
                            <Badge variant="primary" className="text-[10px] px-1.5 py-0 font-bold tracking-wider uppercase bg-brand-100 text-brand-700">Real-time</Badge>
                        </h1>
                        <p className="text-slate-600 text-sm sm:text-base mt-0.5 font-medium">Process and track your customer orders with ease.</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                        <Button
                            onClick={bulkPrintInvoices}
                            variant="outline"
                            className="flex items-center space-x-1.5 sm:space-x-2 px-3 py-2 sm:px-5 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold text-brand-600 bg-brand-50 hover:bg-brand-100 border-brand-200"
                        >
                            <HiOutlinePrinter className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            <span className="hidden sm:inline">PRINT INVOICES</span>
                        </Button>
                        <Button
                            onClick={exportOrders}
                            variant="outline"
                            className="flex items-center space-x-1.5 sm:space-x-2 px-3 py-2 sm:px-5 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold text-slate-600 bg-white hover:bg-slate-50 border-slate-200"
                        >
                            <HiOutlineDocumentText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            <span className="hidden sm:inline">EXPORT ALL</span>
                        </Button>
                        <Button
                            onClick={() => setIsQuickViewModalOpen(true)}
                            className="px-4 py-2 sm:px-6 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-xl flex items-center space-x-1.5 sm:space-x-2"
                        >
                            <HiOutlineEye className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:mr-0" />
                            <span className="hidden sm:inline">QUICK VIEW</span>
                        </Button>
                    </div>
                </div>
            </BlurFade>

            {/* Quick Stats */}
            {loading ? (
                <div className="min-h-[400px] flex flex-col items-center justify-center bg-white rounded-3xl border border-slate-100 shadow-sm">
                    <Loader2 className="h-10 w-10 text-primary animate-spin" />
                    <p className="text-slate-600 font-bold mt-4 uppercase tracking-widest text-xs">Fetching Active Orders...</p>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                        {stats.map((stat, i) => (
                            <BlurFade key={i} delay={0.1 + (i * 0.05)}>
                                <MagicCard
                                    className="border-none shadow-sm ring-1 ring-slate-100 p-0 overflow-hidden group bg-white"
                                    gradientColor={stat.bg.includes('indigo') ? "#eef2ff" : stat.bg.includes('amber') ? "#fffbeb" : stat.bg.includes('emerald') ? "#ecfdf5" : "#fff1f2"}
                                >
                                    <div className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 relative z-10">
                                        <div className={cn("h-10 w-10 sm:h-12 sm:w-12 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110 duration-300 shadow-sm shrink-0", stat.bg, stat.color)}>
                                            <stat.icon className="h-5 w-5 sm:h-6 sm:w-6" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-widest truncate">{stat.label}</p>
                                            <h4 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">{stat.value}</h4>
                                        </div>
                                    </div>
                                </MagicCard>
                            </BlurFade>
                        ))}
                    </div>

                    {/* Main Content Area */}
                    <BlurFade delay={0.3}>
                        <Card className="border-none shadow-xl ring-1 ring-slate-100 rounded-lg bg-white overflow-visible">
                            {/* Tabs */}
                            <div className="border-b border-slate-100 bg-slate-50/30 overflow-x-auto scrollbar-hide">
                                <div className="flex px-3 sm:px-6 items-center min-w-max">
                                    {tabs.map((tab) => (
                                        <button
                                            key={tab}
                                            onClick={() => setActiveTab(tab)}
                                            className={cn(
                                                "relative py-3 sm:py-4 px-2.5 sm:px-4 text-xs sm:text-sm font-bold whitespace-nowrap transition-all duration-300",
                                                activeTab === tab
                                                    ? "text-primary scale-105"
                                                    : "text-slate-600 hover:text-slate-700"
                                            )}
                                        >
                                            {tab}
                                            {activeTab === tab && (
                                                <motion.div
                                                    layoutId="tab-underline"
                                                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full mx-2 sm:mx-4"
                                                />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Toolbox */}
                            <div className="p-3 sm:p-4 border-b border-slate-100 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
                                <div className="relative flex-1 group w-full">
                                    <HiOutlineMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600 group-focus-within:text-primary transition-all" />
                                    <input
                                        type="text"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Search by Order ID or Customer Name..."
                                        className="w-full pl-10 pr-4 py-2.5 bg-slate-100/50 border-none rounded-lg text-sm font-semibold text-slate-700 placeholder:text-slate-500 focus:ring-2 focus:ring-primary/5 transition-all outline-none"
                                    />
                                </div>
                                <div className="flex gap-3 shrink-0 w-full lg:w-auto items-center justify-end flex-wrap">
                                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end sm:justify-start">
                                        <div className="w-full sm:w-32">
                                            <DatePicker
                                                value={startDate}
                                                max={todayStr}
                                                align="left"
                                                onChange={(value) => {
                                                    if (!value) {
                                                        setStartDate("");
                                                        setPage(1);
                                                        return;
                                                    }
                                                    const today = new Date().toISOString().split("T")[0];
                                                    if (value > today) {
                                                        showToast("Start date cannot be in the future", "error");
                                                        return;
                                                    }
                                                    if (endDate && value > endDate) {
                                                        showToast("Start date cannot be after end date", "error");
                                                        return;
                                                    }
                                                    setPage(1);
                                                    setStartDate(value);
                                                }}
                                                placeholder="From date"
                                            />
                                        </div>
                                        <span className="text-xs font-semibold text-slate-600 hidden sm:inline">
                                            to
                                        </span>
                                        <div className="w-full sm:w-32 mt-2 sm:mt-0">
                                            <DatePicker
                                                value={endDate}
                                                max={todayStr}
                                                min={startDate || undefined}
                                                align="right"
                                                popupClassName="mt-4"
                                                disabled={!startDate}
                                                onChange={(value) => {
                                                    if (!value) {
                                                        setEndDate("");
                                                        setPage(1);
                                                        return;
                                                    }
                                                    const today = new Date().toISOString().split("T")[0];
                                                    if (value > today) {
                                                        showToast("End date cannot be in the future", "error");
                                                        return;
                                                    }
                                                    if (startDate && value < startDate) {
                                                        showToast("End date cannot be before start date", "error");
                                                        return;
                                                    }
                                                    setPage(1);
                                                    setEndDate(value);
                                                }}
                                                placeholder="To date"
                                            />
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => { setStartDate(''); setEndDate(''); setPage(1); }}
                                        className="text-xs font-semibold text-slate-600 hover:text-slate-700"
                                    >
                                        Clear dates
                                    </button>
                                </div>
                            </div>

                            {/* Mobile: Card list */}
                            <div className="md:hidden p-3 sm:p-4 space-y-3">
                                {filteredOrders.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 px-4">
                                        <div className="h-14 w-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-3">
                                            <HiOutlineInboxStack className="h-7 w-7" />
                                        </div>
                                        <h3 className="text-sm font-bold text-slate-900">No orders found</h3>
                                        <p className="text-xs text-slate-600 font-medium text-center mt-1">Adjust filters or search.</p>
                                        <Button variant="outline" className="mt-4 rounded-xl text-xs" onClick={() => { setActiveTab('All'); setSearchTerm(''); }}>CLEAR FILTERS</Button>
                                    </div>
                                ) : (
                                    <AnimatePresence mode="popLayout">
                                        {filteredOrders
                                            .slice((page - 1) * pageSize, page * pageSize)
                                            .map((order) => (
                                                <motion.div
                                                    key={order.id}
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, scale: 0.95 }}
                                                    className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm active:bg-slate-50/50"
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0 flex-1" onClick={() => handleViewDetails(order)}>
                                                            <p className="text-xs font-black text-slate-900 truncate">#{order.id}</p>
                                                            <p className="text-xs font-semibold text-slate-600 mt-0.5 flex items-center gap-1">
                                                                <HiOutlineCalendarDays className="h-3 w-3 shrink-0" />
                                                                {order.date} • {order.time}
                                                            </p>
                                                            <div className="flex items-center gap-2 mt-2">
                                                                <div className="h-7 w-7 rounded-full bg-slate-900 flex items-center justify-center text-[10px] font-black text-white shrink-0">
                                                                    {order.customer.avatar}
                                                                </div>
                                                                <p className="text-xs font-bold text-slate-800 truncate">{order.customer.name}</p>
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-2">
                                                                <p className="text-sm font-black text-slate-900">₹{order.total.toLocaleString()}</p>
                                                                <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 uppercase border font-bold", order.payment?.includes('Online') ? 'border-green-200 text-green-700 bg-green-50' : order.payment?.includes('Wallet') ? 'border-blue-200 text-blue-700 bg-blue-50' : 'border-amber-200 text-amber-700 bg-amber-50')}>
                                                                    {order.payment}
                                                                </Badge>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col items-end gap-2 shrink-0">
                                                            <Badge variant={getStatusColor(order.status)} className="text-[10px] font-black uppercase px-2 py-0">
                                                                {order.status}
                                                            </Badge>
                                                            <StatusDropdown
                                                                value={order.status}
                                                                onChange={(val) => handleStatusUpdate(order.id, val)}
                                                                variant="default"
                                                            />
                                                            <button
                                                                onClick={() => handleViewDetails(order)}
                                                                className="p-2 hover:bg-slate-100 rounded-lg text-slate-600"
                                                            >
                                                                <HiOutlineEye className="h-4 w-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            ))}
                                    </AnimatePresence>
                                )}
                            </div>

                            {/* Desktop: Table */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="w-full text-left border-collapse min-w-[640px]">
                                    <thead>
                                        <tr className="bg-slate-50/50 border-b border-slate-100">
                                            <th className="px-4 lg:px-6 py-3 lg:py-4 text-xs font-bold text-slate-600 uppercase tracking-widest">Order Details</th>
                                            <th className="px-4 lg:px-6 py-3 lg:py-4 text-xs font-bold text-slate-600 uppercase tracking-widest">Customer</th>
                                            <th className="px-4 lg:px-6 py-3 lg:py-4 text-xs font-bold text-slate-600 uppercase tracking-widest">Total</th>
                                            <th className="px-4 lg:px-6 py-3 lg:py-4 text-xs font-bold text-slate-600 uppercase tracking-widest">Status</th>
                                            <th className="px-4 lg:px-6 py-3 lg:py-4 text-xs font-bold text-slate-600 uppercase tracking-widest text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        <AnimatePresence mode="popLayout">
                                            {filteredOrders
                                                .slice((page - 1) * pageSize, page * pageSize)
                                                .map((order) => (
                                                    <motion.tr
                                                        layout
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, scale: 0.95 }}
                                                        key={order.id}
                                                        className="hover:bg-slate-50/50 transition-colors group"
                                                    >
                                                        <td className="px-4 lg:px-6 py-3 lg:py-4">
                                                            <div>
                                                                <span className="text-xs font-bold text-slate-900 group-hover:text-primary transition-colors cursor-pointer" onClick={() => handleViewDetails(order)}>
                                                                    #{order.id}
                                                                </span>
                                                                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mt-1">
                                                                    <HiOutlineCalendarDays className="h-3 w-3" />
                                                                    {order.date} • {order.time}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 lg:px-6 py-3 lg:py-4">
                                                            <div className="flex items-center gap-3">
                                                                <div className="h-8 w-8 rounded-full bg-slate-900 flex items-center justify-center text-[10px] font-black text-white shadow-sm ring-2 ring-white">
                                                                    {order.customer.avatar}
                                                                </div>
                                                                <div>
                                                                    <p className="text-xs font-bold text-slate-900">{order.customer.name}</p>
                                                                    <p className="text-xs font-semibold text-slate-600">{order.customer.phone}</p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 lg:px-6 py-3 lg:py-4">
                                                            <div className="flex flex-col items-start gap-1">
                                                                <div className="flex flex-col">
                                                                    <span className="text-xs font-bold text-slate-900">₹{order.total.toLocaleString()}</span>
                                                                    <span className="text-xs font-semibold text-slate-600">{order.items.length} items</span>
                                                                </div>
                                                                <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 uppercase border font-bold", order.payment?.includes('Online') ? 'border-green-200 text-green-700 bg-green-50' : order.payment?.includes('Wallet') ? 'border-blue-200 text-blue-700 bg-blue-50' : 'border-amber-200 text-amber-700 bg-amber-50')}>
                                                                    {order.payment}
                                                                </Badge>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 lg:px-6 py-3 lg:py-4">
                                                                <StatusDropdown
                                                                    value={order.status}
                                                                    onChange={(val) => handleStatusUpdate(order.id, val)}
                                                                    variant="table"
                                                                />
                                                        </td>
                                                        <td className="px-4 lg:px-6 py-3 lg:py-4 text-right">
                                                            <div className="flex items-center justify-end space-x-1.5">
                                                                <button
                                                                    onClick={() => handleViewDetails(order)}
                                                                    className="p-1.5 hover:bg-white hover:text-primary rounded-lg transition-all text-slate-600 shadow-sm ring-1 ring-slate-100"
                                                                    title="View Details"
                                                                >
                                                                    <HiOutlineEye className="h-4 w-4" />
                                                                </button>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        generateAdminInvoicePdf(order, settings);
                                                                    }}
                                                                    className="p-1.5 hover:bg-white hover:text-fuchsia-600 rounded-lg transition-all text-slate-600 shadow-sm ring-1 ring-slate-100"
                                                                    title="Download Platform Invoice"
                                                                >
                                                                    <HiOutlineDocumentText className="h-4 w-4" />
                                                                </button>
                                                                <button
                                                                    onClick={async (e) => {
                                                                        e.stopPropagation();
                                                                        try {
                                                                            const res = await sellerApi.getLabelData(order.id);
                                                                            const labelData = res.data?.data || {};
                                                                            generateInvoicePdf(order, settings, false, null, labelData.bagId, labelData.basketId);
                                                                        } catch (err) {
                                                                            generateInvoicePdf(order, settings);
                                                                        }
                                                                    }}
                                                                    className="p-1.5 hover:bg-white hover:text-brand-600 rounded-lg transition-all text-slate-600 shadow-sm ring-1 ring-slate-100"
                                                                    title="Download Invoice"
                                                                >
                                                                    <HiOutlinePrinter className="h-4 w-4" />
                                                                </button>
                                                                {order.status === 'Pending' && (
                                                                    <>
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleStatusUpdate(order.id, 'Processing');
                                                                            }}
                                                                            className="p-1.5 hover:bg-brand-50 hover:text-brand-600 rounded-lg transition-all text-slate-600 shadow-sm ring-1 ring-slate-100"
                                                                        >
                                                                            <HiOutlineCheck className="h-4 w-4" />
                                                                        </button>
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleStatusUpdate(order.id, 'Cancelled');
                                                                            }}
                                                                            className="p-1.5 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-all text-slate-600 shadow-sm ring-1 ring-slate-100"
                                                                        >
                                                                            <HiOutlineXMark className="h-4 w-4" />
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </motion.tr>
                                                ))}
                                        </AnimatePresence>
                                    </tbody>
                                </table>
                                {filteredOrders.length === 0 && (
                                    <div className="flex flex-col items-center justify-center py-20 px-6">
                                        <div className="h-16 w-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-4">
                                            <HiOutlineInboxStack className="h-8 w-8" />
                                        </div>
                                        <h3 className="text-sm font-bold text-slate-900">No orders found</h3>
                                        <p className="text-xs text-slate-600 font-medium max-w-xs text-center mt-1">We couldn't find any orders matching your current filters. Try adjusting your search.</p>
                                        <Button variant="outline" className="mt-6 rounded-xl text-xs" onClick={() => { setActiveTab('All'); setSearchTerm(''); }}>CLEAR ALL FILTERS</Button>
                                    </div>
                                )}
                            </div>

                            <div className="p-3 sm:p-4 border-t border-slate-50 bg-slate-50/30 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 px-3 sm:px-6">
                                <p className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-widest text-center sm:text-left">
                                    Showing {filteredOrders.length} of {total || summary.totalOrders || filteredOrders.length} Orders
                                </p>
                                <div className="flex gap-1 justify-center sm:justify-end">
                                    <button className="p-1.5 rounded-lg border border-slate-200 text-slate-600 opacity-50 cursor-not-allowed" aria-hidden><HiOutlineChevronRight className="h-3.5 w-3.5 rotate-180" /></button>
                                    <button className="p-1.5 rounded-lg border border-slate-200 text-slate-600 opacity-50 cursor-not-allowed" aria-hidden><HiOutlineChevronRight className="h-3.5 w-3.5" /></button>
                                </div>
                            </div>
                        </Card>
                    </BlurFade>

                    <div className="mt-3 sm:mt-4 px-2 sm:px-0">
                        <Pagination
                            page={page}
                            totalPages={Math.ceil((total || filteredOrders.length) / pageSize) || 1}
                            total={total || filteredOrders.length}
                            pageSize={pageSize}
                            onPageChange={(p) => setPage(p)}
                            onPageSizeChange={(newSize) => {
                                setPageSize(newSize);
                                setPage(1);
                                fetchOrders(1, false);
                            }}
                            loading={loading}
                        />
                    </div>

                    {/* Order Details Modal */}
                    {/* ... (existing details modal) */}

                    {/* Quick View Summary Modal */}
                    <AnimatePresence>
                        {isQuickViewModalOpen && (
                            <div className="fixed inset-0 z-[999] flex items-center justify-center p-3 sm:p-4" data-lenis-prevent="true">
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
                                    onClick={() => setIsQuickViewModalOpen(false)}
                                />
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                    className="w-full max-w-lg relative z-10 bg-white rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
                                >
                                    <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="h-9 w-9 sm:h-10 sm:w-10 bg-primary text-primary-foreground rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
                                                <HiOutlineChartBar className="h-4 w-4 sm:h-5 sm:w-5" />
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="text-sm sm:text-base font-black text-slate-900 truncate">Quick Snapshot</h3>
                                                <p className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-widest">Today's Performance</p>
                                            </div>
                                        </div>
                                        <button onClick={() => setIsQuickViewModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-600 shrink-0">
                                            <HiOutlineXMark className="h-5 w-5" />
                                        </button>
                                    </div>

                                    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                                        {/* Summary Grid */}
                                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                                            <div className="p-3 sm:p-4 rounded-2xl bg-brand-50 border border-brand-100">
                                                <p className="text-[10px] sm:text-xs font-bold text-brand-400 uppercase tracking-widest mb-1">Total Revenue</p>
                                                <p className="text-base sm:text-xl font-black text-brand-700 truncate">₹{summary.totalAmount.toLocaleString('en-IN')}</p>
                                            </div>
                                            <div className="p-3 sm:p-4 rounded-2xl bg-brand-50 border border-brand-100">
                                                <p className="text-[10px] sm:text-xs font-bold text-brand-400 uppercase tracking-widest mb-1">Avg. Order Value</p>
                                                <p className="text-base sm:text-xl font-black text-brand-700">₹{summary.totalOrders ? (summary.totalAmount / summary.totalOrders).toFixed(0) : '0'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-100">
                                        <Button
                                            onClick={() => {
                                                setIsQuickViewModalOpen(false);
                                                setActiveTab('Pending');
                                            }}
                                            className="w-full py-2.5 sm:py-3 text-[10px] sm:text-xs font-bold"
                                        >
                                            VIEW ALL PENDING ORDERS
                                        </Button>
                                    </div>
                                </motion.div>
                            </div>
                        )}
                    </AnimatePresence>
                    <AnimatePresence>
                        {isDetailsModalOpen && selectedOrder && (
                            <div className="fixed inset-0 z-[999] flex items-stretch sm:items-center justify-center p-3 sm:p-6 lg:p-12" data-lenis-prevent="true">
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="fixed inset-0 bg-slate-900/40 backdrop-blur-md"
                                    onClick={() => setIsDetailsModalOpen(false)}
                                />
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                    className="w-full max-w-lg sm:max-w-2xl relative z-10 bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                                >
                                    {/* Modal Header */}
                                    <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-100">
                                        <div className="flex items-center space-x-3">
                                            <div className="h-10 w-10 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-lg">
                                                <HiOutlineTruck className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <h3 className="text-base font-black text-slate-900">Order Details</h3>
                                                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                                    <Badge variant={getStatusColor(selectedOrder.status)} className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0">{selectedOrder.status}</Badge>
                                                    <span className="text-xs font-bold text-slate-600 uppercase tracking-widest break-all">#{selectedOrder.id}</span>
                                                </div>
                                                {(selectedOrder.date || selectedOrder.time) && (
                                                    <p className="text-[11px] font-bold text-slate-500 mt-1.5 flex items-center gap-1.5">
                                                        <HiOutlineCalendarDays className="h-3.5 w-3.5" />
                                                        {selectedOrder.date}
                                                        {selectedOrder.time && (
                                                            <>
                                                                <span className="text-slate-300">•</span>
                                                                <HiOutlineClock className="h-3.5 w-3.5" />
                                                                {selectedOrder.time}
                                                            </>
                                                        )}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex gap-2 items-center">
                                            <button
                                                onClick={() => generateInvoicePdf(selectedOrder, settings, false, null, linkedBag, linkedBasket)}
                                                className="p-2 hover:bg-brand-50 hover:text-brand-600 rounded-xl transition-colors text-slate-500 shadow-sm ring-1 ring-slate-200"
                                                title="Download Invoice"
                                            >
                                                <HiOutlinePrinter className="h-4 w-4 sm:h-5 sm:w-5" />
                                            </button>
                                            <button onClick={() => setIsDetailsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600">
                                                <HiOutlineXMark className="h-5 w-5" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="px-4 py-4 sm:px-6 sm:py-5 overflow-y-auto custom-scrollbar flex-1">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
                                            <div className="space-y-3 sm:space-y-4">
                                                <div>
                                                    <div className="flex items-center justify-between gap-2 mb-2">
                                                        <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest flex items-center gap-2">
                                                            <HiOutlineMapPin className="h-3 w-3 text-primary" /> Delivery Address
                                                        </h4>
                                                        {selectedOrder.location &&
                                                            typeof selectedOrder.location.lat === "number" &&
                                                            typeof selectedOrder.location.lng === "number" && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const { lat, lng } = selectedOrder.location;
                                                                        window.open(
                                                                            `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
                                                                            "_blank",
                                                                        );
                                                                    }}
                                                                    className="text-[10px] font-bold text-primary hover:underline"
                                                                >
                                                                    View on map
                                                                </button>
                                                            )}
                                                    </div>
                                                    <p className="text-xs font-bold text-slate-800 leading-relaxed bg-slate-50 p-3 rounded-2xl border border-slate-100 shadow-sm">
                                                        {selectedOrder.address}
                                                    </p>
                                                </div>
                                                <div>
                                                    <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                                                        <HiOutlinePhone className="h-3 w-3 text-brand-500" /> Contact Info
                                                    </h4>
                                                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 shadow-sm">
                                                        <p className="text-xs font-bold text-slate-800">{selectedOrder.customer.name}</p>
                                                        <p className="text-xs font-semibold text-slate-600 mt-0.5">{selectedOrder.customer.phone}</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="space-y-3 sm:space-y-4">
                                                <div className="bg-primary/5 p-3 sm:p-4 rounded-3xl border border-primary/10">
                                                    <h4 className="text-xs font-black text-primary uppercase tracking-widest mb-3">Order Summary</h4>
                                                    <div className="space-y-2">
                                                        <div className="flex justify-between text-xs">
                                                            <span className="font-bold text-slate-600">Subtotal</span>
                                                            <span className="font-black text-slate-900">₹{(selectedOrder.total - 10).toFixed(2)}</span>
                                                        </div>
                                                        <div className="flex justify-between text-xs">
                                                            <span className="font-bold text-slate-600">Delivery Fee</span>
                                                            <span className="font-black text-brand-600">₹10.00</span>
                                                        </div>
                                                        <div className="h-px bg-primary/10 my-2" />
                                                        <div className="flex justify-between text-sm">
                                                            <span className="font-black text-slate-900">Total</span>
                                                            <span className="font-black text-primary">₹{selectedOrder.total.toFixed(2)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="bg-slate-900 p-3 sm:p-4 rounded-3xl text-white shadow-xl shadow-slate-900/10">
                                                    <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest mb-2">Payment Status</h4>
                                                    <div className="flex items-center gap-2">
                                                        <HiOutlineBanknotes className="h-5 w-5 text-brand-400" />
                                                        <span className="text-xs font-bold tracking-tight">{selectedOrder.payment}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Bag & Basket Linking UI */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
                                            <div className="bg-slate-50 border border-slate-100 rounded-3xl p-4 sm:p-5">
                                                <div className="flex items-center justify-between mb-4">
                                                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                                        <HiOutlineArchiveBox className="h-4 w-4 text-brand-500" />
                                                        Bag Linking
                                                    </h4>
                                                    {bagLoading && <Loader2 className="h-4 w-4 text-brand-500 animate-spin" />}
                                                </div>

                                                {!bagLoading && (
                                                    linkedBag ? (
                                                        <div className="bg-white p-3 sm:p-4 rounded-2xl border border-brand-100 shadow-sm flex flex-col gap-3">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Linked Bag</p>
                                                                {['pending', 'confirmed', 'packed'].includes(selectedOrder.status.toLowerCase()) && (
                                                                    <Button size="sm" variant="outline" className="h-7 text-[10px] font-bold px-2.5 py-0" onClick={() => setIsManualSelectOpen(true)}>
                                                                        REPLACE
                                                                    </Button>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                {linkedBagQrUrl && <img src={linkedBagQrUrl} alt="Bag QR" className="h-12 w-12 sm:h-14 sm:w-14 rounded-lg border border-slate-100 p-0.5 bg-white shrink-0" />}
                                                                <p className="text-sm sm:text-base font-black text-brand-700 break-all leading-tight">{linkedBag}</p>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col gap-3">
                                                            <Button className="w-full text-xs font-bold py-2.5" onClick={() => setIsScannerOpen(true)}>
                                                                <HiOutlineQrCode className="h-4 w-4 mr-2" />
                                                                SCAN QR BAG
                                                            </Button>
                                                            <span className="hidden sm:flex items-center justify-center text-xs font-bold text-slate-400 uppercase">OR</span>
                                                            <Button variant="outline" className="w-full text-xs font-bold py-2.5" onClick={() => setIsManualSelectOpen(true)}>
                                                                SELECT AVAILABLE BAG
                                                            </Button>
                                                        </div>
                                                    )
                                                )}
                                            </div>

                                            <div className="bg-slate-50 border border-slate-100 rounded-3xl p-4 sm:p-5">
                                                <div className="flex items-center justify-between mb-4">
                                                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                                        <HiOutlineArchiveBox className="h-4 w-4 text-emerald-500" />
                                                        Basket Linking
                                                    </h4>
                                                    {basketLoading && <Loader2 className="h-4 w-4 text-emerald-500 animate-spin" />}
                                                </div>

                                                {!basketLoading && (
                                                    linkedBasket ? (
                                                        <div className="bg-white p-3 sm:p-4 rounded-2xl border border-emerald-100 shadow-sm flex flex-col gap-3">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Linked Basket</p>
                                                                {['pending', 'confirmed', 'packed'].includes(selectedOrder.status.toLowerCase()) && (
                                                                    <Button size="sm" variant="outline" className="h-7 text-[10px] font-bold px-2.5 py-0" onClick={() => setIsBasketManualSelectOpen(true)}>
                                                                        REPLACE
                                                                    </Button>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                {linkedBasketQrUrl && <img src={linkedBasketQrUrl} alt="Basket QR" className="h-12 w-12 sm:h-14 sm:w-14 rounded-lg border border-slate-100 p-0.5 bg-white shrink-0" />}
                                                                <p className="text-sm sm:text-base font-black text-emerald-700 break-all leading-tight">{linkedBasket}</p>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col gap-3">
                                                            <Button className="w-full text-xs font-bold py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white border-transparent" onClick={() => setIsBasketScannerOpen(true)}>
                                                                <HiOutlineQrCode className="h-4 w-4 mr-2" />
                                                                SCAN QR BASKET
                                                            </Button>
                                                            <span className="hidden sm:flex items-center justify-center text-xs font-bold text-slate-400 uppercase">OR</span>
                                                            <Button variant="outline" className="w-full text-xs font-bold py-2.5" onClick={() => setIsBasketManualSelectOpen(true)}>
                                                                SELECT AVAILABLE BASKET
                                                            </Button>
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                        </div>

                                        {/* Pack Order Action */}
                                        {(linkedBag || linkedBasket) && ['pending', 'confirmed'].includes(selectedOrder?.status?.toLowerCase()) && (
                                            <div className="mb-6 sm:mb-8">
                                                <Button
                                                    className="w-full bg-brand-600 hover:bg-brand-700 text-white font-black py-4 shadow-xl shadow-brand-500/20 text-sm tracking-widest"
                                                    onClick={async () => {
                                                        try {
                                                            await sellerApi.updateOrderStatus(selectedOrder.id || selectedOrder._id, { status: 'packed' });
                                                            showToast('Order successfully marked as packed', 'success');
                                                            setSelectedOrder(prev => ({ ...prev, status: 'packed' }));
                                                            fetchOrders();
                                                            setIsDetailsModalOpen(false);
                                                        } catch (err) {
                                                            showToast(err.response?.data?.message || 'Failed to update order status', 'error');
                                                        }
                                                    }}
                                                >
                                                    <HiOutlineCheck className="h-5 w-5 mr-2" />
                                                    SAVE & MARK AS PACKED
                                                </Button>
                                            </div>
                                        )}

                                        <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest mb-3 sm:mb-4">Items Ordered ({selectedOrder.items.length})</h4>
                                        <div className="space-y-3 max-h-52 sm:max-h-64 overflow-y-auto pr-1">
                                            {selectedOrder.items.map((item, idx) => (
                                                <div key={idx} className="flex items-center justify-between p-3 bg-white ring-1 ring-slate-100 rounded-2xl group hover:shadow-md transition-all">
                                                    <div className="flex items-center gap-4">
                                                        <div className="h-12 w-12 rounded-xl overflow-hidden bg-slate-50 ring-1 ring-slate-200">
                                                            <img src={item.image} alt={item.name} className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-bold text-slate-900">{item.name}</p>
                                                            <p className="text-xs font-semibold text-slate-600 mt-0.5">₹{item.price.toFixed(2)} × {item.qty}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-xs font-black text-slate-900">₹{(item.price * item.qty).toFixed(2)}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Modal Footer */}
                                    <div className="px-4 py-3 sm:px-6 sm:py-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row gap-3 sm:gap-0 sm:items-center justify-end">
                                        <div className="flex gap-2 items-center">
                                            <button onClick={() => setIsDetailsModalOpen(false)} className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-all">CLOSE</button>
                                            <div className="relative inline-block w-40">
                                                <StatusDropdown
                                                    value={selectedOrder.status}
                                                    onChange={(val) => handleStatusUpdate(selectedOrder.id, val)}
                                                    variant="modal"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            </div>
                        )}
                    </AnimatePresence>
                </>
            )}

            <OrderBagScannerModal
                isOpen={isScannerOpen}
                onClose={() => setIsScannerOpen(false)}
                onScanSuccess={handleLinkBag}
            />
            <BagManualSelectModal
                isOpen={isManualSelectOpen}
                onClose={() => setIsManualSelectOpen(false)}
                onSelect={handleLinkBag}
                currentBagId={linkedBag}
            />
            <OrderBasketScannerModal
                isOpen={isBasketScannerOpen}
                onClose={() => setIsBasketScannerOpen(false)}
                onScanSuccess={handleLinkBasket}
            />
            <BasketManualSelectModal
                isOpen={isBasketManualSelectOpen}
                onClose={() => setIsBasketManualSelectOpen(false)}
                onSelect={handleLinkBasket}
                currentBasketId={linkedBasket}
            />

            <AnimatePresence>
                {isPackSelectionModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" data-lenis-prevent="true">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
                            onClick={() => setIsPackSelectionModalOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="w-full max-w-sm relative z-10 bg-white rounded-2xl shadow-2xl overflow-hidden p-6"
                        >
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-black text-slate-900 pr-6 break-words leading-tight">
                                    Pack Order <br />
                                    <span className="text-primary text-base break-all mt-1 block">#{selectedOrder?.id}</span>
                                </h3>
                                <button onClick={() => setIsPackSelectionModalOpen(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                                    <HiOutlineXMark className="h-5 w-5 text-slate-600" />
                                </button>
                            </div>
                            <p className="text-sm text-slate-600 mb-6 font-medium">Please assign a bag or basket to mark this order as packed.</p>
                            <div className="flex flex-col gap-3">
                                <Button onClick={() => { setIsPackSelectionModalOpen(false); setIsScannerOpen(true); }} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 border-transparent shadow-sm">
                                    <HiOutlineQrCode className="h-4 w-4 mr-2" />
                                    SCAN BAG QR
                                </Button>
                                <Button onClick={() => { setIsPackSelectionModalOpen(false); setIsManualSelectOpen(true); }} variant="outline" className="w-full font-bold py-3">
                                    SELECT BAG MANUALLY
                                </Button>

                                <div className="flex items-center gap-2 my-2">
                                    <div className="flex-1 h-px bg-slate-100"></div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">OR</span>
                                    <div className="flex-1 h-px bg-slate-100"></div>
                                </div>

                                <Button onClick={() => { setIsPackSelectionModalOpen(false); setIsBasketScannerOpen(true); }} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 border-transparent">
                                    <HiOutlineQrCode className="h-4 w-4 mr-2" />
                                    SCAN BASKET QR
                                </Button>
                                <Button onClick={() => { setIsPackSelectionModalOpen(false); setIsBasketManualSelectOpen(true); }} variant="outline" className="w-full font-bold py-3">
                                    SELECT BASKET MANUALLY
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Orders;
