import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import {
    HiOutlineTruck,
    HiOutlineXMark,
    HiOutlineMapPin,
    HiOutlinePhone,
    HiOutlineBanknotes,
    HiOutlineCalendarDays,
    HiOutlineClock,
    HiOutlineQrCode,
    HiOutlineArchiveBox,
    HiOutlinePrinter,
    HiOutlineCheck,
    HiOutlineChevronDown,
} from 'react-icons/hi2';
import { cn } from '@/lib/utils';
import Badge from '@shared/components/ui/Badge';
import Button from '@shared/components/ui/Button';
import { sellerApi } from '../services/sellerApi';
import { getOrderStatusVariant } from './orders';
import OrderBagScannerModal from './OrderBagScannerModal';
import BagManualSelectModal from './BagManualSelectModal';
import OrderBasketScannerModal from './OrderBasketScannerModal';
import BasketManualSelectModal from './BasketManualSelectModal';
import { generateInvoicePdf } from '@/shared/utils/invoiceGenerator';
import { generateBagQRDataURL } from '@/shared/utils/qrBagUtils';
import { useSettings } from '@core/context/SettingsContext';
import { useToast } from '@shared/components/ui/Toast';

const STATUS_OPTIONS = [
    { value: 'pending', label: 'Pending' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'packed', label: 'Packed' },
    { value: 'out_for_delivery', label: 'Out for Delivery' },
    { value: 'delivered', label: 'Delivered' },
    { value: 'cancelled', label: 'Cancelled' },
];

const StatusDropdown = ({ value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selected = STATUS_OPTIONS.find(o => o.value === (value || '').toLowerCase()) || STATUS_OPTIONS[0];
    const variant = getOrderStatusVariant(value);
    const colorClasses =
        variant === 'warning' ? 'bg-amber-100 text-amber-700 hover:bg-amber-200/80' :
        variant === 'info' ? 'bg-brand-100 text-brand-700 hover:bg-brand-200/80' :
        variant === 'primary' ? 'bg-brand-100 text-brand-700 hover:bg-brand-200/80' :
        variant === 'secondary' ? 'bg-purple-100 text-purple-700 hover:bg-purple-200/80' :
        variant === 'success' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200/80' :
        variant === 'error' ? 'bg-rose-100 text-rose-700 hover:bg-rose-200/80' :
        'bg-slate-100 text-slate-700 hover:bg-slate-200/80';

    return (
        <div className="relative inline-block w-full" ref={ref} onClick={e => e.stopPropagation()}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    'flex items-center justify-between border border-transparent w-full',
                    'w-full text-[10px] pl-3 pr-8 py-2 rounded-xl font-black uppercase tracking-wider transition-all shadow-sm outline-none',
                    colorClasses,
                )}
            >
                <span className="truncate">{selected.label}</span>
                <HiOutlineChevronDown className={cn('absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 opacity-60 transition-transform duration-200', isOpen && 'rotate-180')} />
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -5, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -5, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute z-[9999] mt-1 w-44 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden py-1 bottom-full mb-1 right-0"
                    >
                        {STATUS_OPTIONS.map(option => (
                            <button
                                key={option.value}
                                onClick={e => { e.stopPropagation(); onChange(option.value); setIsOpen(false); }}
                                className={cn(
                                    'w-full text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors',
                                    (value || '').toLowerCase() === option.value
                                        ? 'bg-primary/5 text-primary'
                                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
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

/**
 * OrderDetailModal — shared between Orders.jsx and Dashboard.jsx
 *
 * Props:
 *   order           Normalized order object (same shape as Orders.jsx produces)
 *   isOpen          boolean
 *   onClose         () => void
 *   onStatusUpdate  (orderId, newStatus) => Promise<void>   — called after status changes
 *   onRefresh       () => void                              — called after bag/basket linking
 */
const OrderDetailModal = ({ order, isOpen, onClose, onStatusUpdate, onRefresh }) => {
    const { settings } = useSettings();
    const { showToast } = useToast();

    const [linkedBag, setLinkedBag] = useState(null);
    const [bagLoading, setBagLoading] = useState(false);
    const [linkedBasket, setLinkedBasket] = useState(null);
    const [basketLoading, setBasketLoading] = useState(false);
    const [linkedBagQrUrl, setLinkedBagQrUrl] = useState(null);
    const [linkedBasketQrUrl, setLinkedBasketQrUrl] = useState(null);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [isManualSelectOpen, setIsManualSelectOpen] = useState(false);
    const [isBasketScannerOpen, setIsBasketScannerOpen] = useState(false);
    const [isBasketManualSelectOpen, setIsBasketManualSelectOpen] = useState(false);
    const [localOrder, setLocalOrder] = useState(order);

    // Sync localOrder when parent order prop changes
    useEffect(() => {
        setLocalOrder(order);
    }, [order]);

    // Lock body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            if (window.lenis) window.lenis.stop();
        } else {
            document.body.style.overflow = '';
            if (window.lenis) window.lenis.start();
        }
        return () => {
            document.body.style.overflow = '';
            if (window.lenis) window.lenis.start();
        };
    }, [isOpen]);

    // Fetch linked bag/basket when modal opens
    useEffect(() => {
        if (!isOpen || !order?.id) return;
        setBagLoading(true);
        setBasketLoading(true);
        setLinkedBag(null);
        setLinkedBasket(null);
        sellerApi.getLabelData(order.id)
            .then(res => {
                setLinkedBag(res.data?.data?.bagId || null);
                setLinkedBasket(res.data?.data?.basketId || null);
            })
            .catch(() => { setLinkedBag(null); setLinkedBasket(null); })
            .finally(() => { setBagLoading(false); setBasketLoading(false); });
    }, [isOpen, order?.id]);

    // Generate QR URLs
    useEffect(() => {
        if (linkedBag) generateBagQRDataURL(linkedBag).then(setLinkedBagQrUrl).catch(() => setLinkedBagQrUrl(null));
        else setLinkedBagQrUrl(null);
    }, [linkedBag]);

    useEffect(() => {
        if (linkedBasket) generateBagQRDataURL(linkedBasket).then(setLinkedBasketQrUrl).catch(() => setLinkedBasketQrUrl(null));
        else setLinkedBasketQrUrl(null);
    }, [linkedBasket]);

    const handleLinkBag = async (bagId) => {
        if (!localOrder) return;
        try {
            await sellerApi.scanAndAttachBag({ bagId, orderId: localOrder.id || localOrder._id });
            showToast('Bag successfully linked to order', 'success');
            setLinkedBag(bagId);
            setIsScannerOpen(false);
            setIsManualSelectOpen(false);
            if (['pending', 'confirmed'].includes((localOrder.status || '').toLowerCase())) {
                setLocalOrder(prev => ({ ...prev, status: 'packed' }));
                try {
                    await sellerApi.updateOrderStatus(localOrder.id || localOrder._id, { status: 'packed' });
                } catch (err) { /* ignore */ }
            }
            if (typeof onRefresh === 'function') onRefresh();
        } catch (error) {
            showToast(error.response?.data?.message || 'Failed to link bag', 'error');
            setIsScannerOpen(false);
        }
    };

    const handleLinkBasket = async (basketId) => {
        if (!localOrder) return;
        try {
            await sellerApi.scanAndAttachBasket({ basketId, orderId: localOrder.id || localOrder._id });
            showToast('Basket successfully linked to order', 'success');
            setLinkedBasket(basketId);
            setIsBasketScannerOpen(false);
            setIsBasketManualSelectOpen(false);
            if (['pending', 'confirmed'].includes((localOrder.status || '').toLowerCase())) {
                setLocalOrder(prev => ({ ...prev, status: 'packed' }));
                try {
                    await sellerApi.updateOrderStatus(localOrder.id || localOrder._id, { status: 'packed' });
                } catch (err) { /* ignore */ }
            }
            if (typeof onRefresh === 'function') onRefresh();
        } catch (error) {
            showToast(error.response?.data?.message || 'Failed to link basket', 'error');
            setIsBasketScannerOpen(false);
        }
    };

    const handleStatusChange = async (newStatus) => {
        if (typeof onStatusUpdate === 'function') {
            await onStatusUpdate(localOrder.id || localOrder._id, newStatus);
            setLocalOrder(prev => ({ ...prev, status: newStatus }));
        }
    };

    const handleMarkAsPacked = async () => {
        try {
            await sellerApi.updateOrderStatus(localOrder.id || localOrder._id, { status: 'packed' });
            showToast('Order successfully marked as packed', 'success');
            setLocalOrder(prev => ({ ...prev, status: 'packed' }));
            if (typeof onRefresh === 'function') onRefresh();
            onClose();
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to update order status', 'error');
        }
    };

    if (!isOpen || !localOrder) return null;

    const getStatusColor = getOrderStatusVariant;

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <div className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center sm:p-6 lg:p-12" data-lenis-prevent="true">
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-slate-900/40 backdrop-blur-md"
                            onClick={onClose}
                        />

                        {/* Modal */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            className="w-full max-w-lg sm:max-w-2xl relative z-10 bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[95vh] sm:max-h-[90vh]"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-100 shrink-0">
                                <div className="flex items-center space-x-3 min-w-0">
                                    <div className="h-10 w-10 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-lg shrink-0">
                                        <HiOutlineTruck className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-base font-black text-slate-900">Order Details</h3>
                                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                            <Badge variant={getStatusColor(localOrder.status)} className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0">
                                                {localOrder.status}
                                            </Badge>
                                            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest break-all">#{localOrder.id}</span>
                                        </div>
                                        {(localOrder.date || localOrder.time) && (
                                            <p className="text-[11px] font-bold text-slate-500 mt-1 flex items-center gap-1.5">
                                                <HiOutlineCalendarDays className="h-3.5 w-3.5" />
                                                {localOrder.date}
                                                {localOrder.time && (
                                                    <>
                                                        <span className="text-slate-300">•</span>
                                                        <HiOutlineClock className="h-3.5 w-3.5" />
                                                        {localOrder.time}
                                                    </>
                                                )}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-2 items-center shrink-0">
                                    <button
                                        onClick={() => generateInvoicePdf(localOrder, settings, false, null, linkedBag, linkedBasket)}
                                        className="p-2 hover:bg-brand-50 hover:text-brand-600 rounded-xl transition-colors text-slate-500 shadow-sm ring-1 ring-slate-200"
                                        title="Download Invoice"
                                    >
                                        <HiOutlinePrinter className="h-4 w-4 sm:h-5 sm:w-5" />
                                    </button>
                                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600">
                                        <HiOutlineXMark className="h-5 w-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Scrollable content */}
                            <div className="px-4 py-4 sm:px-6 sm:py-5 overflow-y-auto custom-scrollbar flex-1">

                                {/* Bag & Basket Linking — shown first on mobile */}
                                <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
                                    {/* Bag */}
                                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 sm:p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="text-[10px] sm:text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-1.5">
                                                <HiOutlineArchiveBox className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-brand-500" />
                                                Bag
                                            </h4>
                                            {bagLoading && <Loader2 className="h-3.5 w-3.5 text-brand-500 animate-spin" />}
                                        </div>
                                        {!bagLoading && (
                                            linkedBag ? (
                                                <div className="bg-white p-2 sm:p-3 rounded-xl border border-brand-100 shadow-sm flex flex-col gap-2">
                                                    <div className="flex items-center justify-between gap-1">
                                                        <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest">Linked Bag</p>
                                                        {['pending', 'confirmed', 'packed'].includes((localOrder.status || '').toLowerCase()) && (
                                                            <Button size="sm" variant="outline" className="h-6 text-[9px] font-bold px-1.5 py-0" onClick={() => setIsManualSelectOpen(true)}>
                                                                SWAP
                                                            </Button>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col items-center gap-1.5">
                                                        {linkedBagQrUrl && <img src={linkedBagQrUrl} alt="Bag QR" className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg border border-slate-100 p-0.5 bg-white" />}
                                                        <p className="text-[10px] font-black text-brand-700 break-all leading-tight text-center">{linkedBag}</p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-2">
                                                    <Button className="w-full text-[10px] sm:text-xs font-bold py-2" onClick={() => setIsScannerOpen(true)}>
                                                        <HiOutlineQrCode className="h-3.5 w-3.5 mr-1" />
                                                        SCAN BAG
                                                    </Button>
                                                    <span className="flex items-center justify-center text-[10px] font-bold text-slate-400 uppercase">OR</span>
                                                    <Button variant="outline" className="w-full text-[10px] sm:text-xs font-bold py-2" onClick={() => setIsManualSelectOpen(true)}>
                                                        SELECT BAG
                                                    </Button>
                                                </div>
                                            )
                                        )}
                                    </div>

                                    {/* Basket */}
                                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 sm:p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="text-[10px] sm:text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-1.5">
                                                <HiOutlineArchiveBox className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-500" />
                                                Basket
                                            </h4>
                                            {basketLoading && <Loader2 className="h-3.5 w-3.5 text-emerald-500 animate-spin" />}
                                        </div>
                                        {!basketLoading && (
                                            linkedBasket ? (
                                                <div className="bg-white p-2 sm:p-3 rounded-xl border border-emerald-100 shadow-sm flex flex-col gap-2">
                                                    <div className="flex items-center justify-between gap-1">
                                                        <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest">Linked Basket</p>
                                                        {['pending', 'confirmed', 'packed'].includes((localOrder.status || '').toLowerCase()) && (
                                                            <Button size="sm" variant="outline" className="h-6 text-[9px] font-bold px-1.5 py-0" onClick={() => setIsBasketManualSelectOpen(true)}>
                                                                SWAP
                                                            </Button>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col items-center gap-1.5">
                                                        {linkedBasketQrUrl && <img src={linkedBasketQrUrl} alt="Basket QR" className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg border border-slate-100 p-0.5 bg-white" />}
                                                        <p className="text-[10px] font-black text-emerald-700 break-all leading-tight text-center">{linkedBasket}</p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-2">
                                                    <Button className="w-full text-[10px] sm:text-xs font-bold py-2 bg-emerald-600 hover:bg-emerald-700 text-white border-transparent" onClick={() => setIsBasketScannerOpen(true)}>
                                                        <HiOutlineQrCode className="h-3.5 w-3.5 mr-1" />
                                                        SCAN BASKET
                                                    </Button>
                                                    <span className="flex items-center justify-center text-[10px] font-bold text-slate-400 uppercase">OR</span>
                                                    <Button variant="outline" className="w-full text-[10px] sm:text-xs font-bold py-2" onClick={() => setIsBasketManualSelectOpen(true)}>
                                                        SELECT BASKET
                                                    </Button>
                                                </div>
                                            )
                                        )}
                                    </div>
                                </div>

                                {/* Pack Order Button */}
                                {(linkedBag || linkedBasket) && ['pending', 'confirmed'].includes((localOrder.status || '').toLowerCase()) && (
                                    <div className="mb-4 sm:mb-6">
                                        <Button
                                            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-black py-4 shadow-xl shadow-brand-500/20 text-sm tracking-widest"
                                            onClick={handleMarkAsPacked}
                                        >
                                            <HiOutlineCheck className="h-5 w-5 mr-2" />
                                            SAVE & MARK AS PACKED
                                        </Button>
                                    </div>
                                )}

                                {/* Address, Contact, Summary, Payment */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
                                    <div className="space-y-3">
                                        <div>
                                            <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest flex items-center gap-2 mb-2">
                                                <HiOutlineMapPin className="h-3 w-3 text-primary" /> Delivery Address
                                            </h4>
                                            <p className="text-xs font-bold text-slate-800 leading-relaxed bg-slate-50 p-3 rounded-2xl border border-slate-100 shadow-sm">
                                                {localOrder.address || '—'}
                                            </p>
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest flex items-center gap-2 mb-2">
                                                <HiOutlinePhone className="h-3 w-3 text-brand-500" /> Contact Info
                                            </h4>
                                            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 shadow-sm">
                                                <p className="text-xs font-bold text-slate-800">{localOrder.customer?.name || '—'}</p>
                                                <p className="text-xs font-semibold text-slate-600 mt-0.5">{localOrder.customer?.phone || '—'}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="bg-primary/5 p-3 sm:p-4 rounded-3xl border border-primary/10">
                                            <h4 className="text-xs font-black text-primary uppercase tracking-widest mb-3">Order Summary</h4>
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-xs">
                                                    <span className="font-bold text-slate-600">Subtotal</span>
                                                    <span className="font-black text-slate-900">₹{Math.max(0, (localOrder.total || 0) - 10).toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between text-xs">
                                                    <span className="font-bold text-slate-600">Delivery Fee</span>
                                                    <span className="font-black text-brand-600">₹10.00</span>
                                                </div>
                                                <div className="h-px bg-primary/10 my-2" />
                                                <div className="flex justify-between text-sm">
                                                    <span className="font-black text-slate-900">Total</span>
                                                    <span className="font-black text-primary">₹{Number(localOrder.total || 0).toFixed(2)}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="bg-slate-900 p-3 sm:p-4 rounded-3xl text-white shadow-xl shadow-slate-900/10">
                                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Payment Status</h4>
                                            <div className="flex items-center gap-2">
                                                <HiOutlineBanknotes className="h-5 w-5 text-brand-400" />
                                                <span className="text-xs font-bold tracking-tight">{localOrder.payment || 'N/A'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Items */}
                                <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest mb-3">
                                    Items Ordered ({(localOrder.items || []).length})
                                </h4>
                                <div className="space-y-3 max-h-52 sm:max-h-64 overflow-y-auto pr-1">
                                    {(localOrder.items || []).map((item, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-3 bg-white ring-1 ring-slate-100 rounded-2xl group hover:shadow-md transition-all">
                                            <div className="flex items-center gap-3 sm:gap-4">
                                                <div className="h-12 w-12 rounded-xl overflow-hidden bg-slate-50 ring-1 ring-slate-200 shrink-0">
                                                    {item.image ? (
                                                        <img src={item.image} alt={item.name} className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                                    ) : (
                                                        <div className="h-full w-full flex items-center justify-center text-slate-400 text-xs font-bold">—</div>
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-slate-900">{item.name}</p>
                                                    <p className="text-[10px] sm:text-xs font-semibold text-slate-600 mt-0.5">₹{Number(item.price || 0).toFixed(2)} × {item.qty}</p>
                                                </div>
                                            </div>
                                            <p className="text-xs font-black text-slate-900">₹{(Number(item.price || 0) * Number(item.qty || 1)).toFixed(2)}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="px-4 py-3 sm:px-6 sm:py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
                                <button
                                    onClick={onClose}
                                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
                                >
                                    CLOSE
                                </button>
                                <div className="w-44">
                                    <StatusDropdown value={localOrder.status} onChange={handleStatusChange} />
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Sub-modals */}
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
        </>
    );
};

export default OrderDetailModal;
