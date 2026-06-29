import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Card from '@shared/components/ui/Card';
import QRScanner from '@shared/components/ui/QRScanner';
import { validateScannedBasketId } from '@shared/utils/basketUtils';
import { sellerApi } from '../services/sellerApi';
import { toast } from 'sonner';
import {
    ShoppingBasket, ScanLine, Search, CheckCircle2, AlertTriangle,
    Loader2, X, User, MapPin, Zap, RefreshCw, Ban, Package,
    ChevronRight, ListChecks, Printer, Square, CheckSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STEP = { SELECT_ORDER: 1, SCAN_BASKET: 2, PACK_ITEMS: 3, CONFIRM: 4, READY: 5 };

const BasketScanAndPack = () => {
    const [step, setStep] = useState(STEP.SELECT_ORDER);
    const [orders, setOrders] = useState([]);
    const [orderSearch, setOrderSearch] = useState('');
    const [loadingOrders, setLoadingOrders] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scannedBasketId, setScannedBasketId] = useState(null);
    const [validating, setValidating] = useState(false);
    const [validationResult, setValidationResult] = useState(null);
    const [packedItems, setPackedItems] = useState({});
    const [attaching, setAttaching] = useState(false);
    const [attached, setAttached] = useState(false);
    const [cancelledWarning, setCancelledWarning] = useState(false);
    // Multi-basket support
    const [scannedBaskets, setScannedBaskets] = useState([]);
    const [addingMore, setAddingMore] = useState(false);

    // Fetch bulky orders that need basket packing
    useEffect(() => {
        const fetchOrders = async () => {
            setLoadingOrders(true);
            try {
                const res = await sellerApi.getOrders({ page: 1, status: 'confirmed', bulky: true });
                const items = res.data?.result?.items || [];
                setOrders(items);
            } catch (err) {
                console.error("Failed to fetch bulky orders:", err);
                toast.error("Failed to load orders");
            } finally {
                setLoadingOrders(false);
            }
        };
        fetchOrders();
    }, []);

    // Poll for order cancellation
    useEffect(() => {
        if (!selectedOrder) return;
        const interval = setInterval(async () => {
            try {
                const res = await sellerApi.getOrders({ page: 1 });
                const items = res.data?.result?.items || [];
                const updated = items.find(o => o.orderId === selectedOrder.orderId);
                if (updated && ['cancelled', 'CANCELLED'].includes(updated.status?.toLowerCase())) {
                    setCancelledWarning(true);
                    clearInterval(interval);
                }
            } catch { /* ignore */ }
        }, 15000);
        return () => clearInterval(interval);
    }, [selectedOrder]);

    const filteredOrders = orders.filter(o =>
        !orderSearch ||
        o.orderId?.toLowerCase().includes(orderSearch.toLowerCase()) ||
        o.customer?.name?.toLowerCase().includes(orderSearch.toLowerCase())
    );

    const handleSelectOrder = (order) => {
        setSelectedOrder(order);
        setStep(STEP.SCAN_BASKET);
        setScannedBasketId(null);
        setValidationResult(null);
        setAttached(false);
        setCancelledWarning(false);
        setPackedItems({});
        setScannedBaskets([]);
    };

    const handleScan = useCallback(async (raw) => {
        const { valid, error, basketId } = validateScannedBasketId(raw);
        if (!valid) { toast.error(error); return; }

        // Check for duplicate scan in current session
        if (scannedBaskets.includes(basketId)) {
            toast.error(`Basket ${basketId} already scanned for this order!`);
            return;
        }

        setScannerOpen(false);
        setScannedBasketId(basketId);
        setValidating(true);
        setValidationResult(null);

        try {
            const res = await sellerApi.validateBasket(basketId);
            setValidationResult({ valid: true, basket: res.data?.result });
            setStep(STEP.PACK_ITEMS);
        } catch (err) {
            const status = err?.response?.status;
            setValidationResult({
                valid: false,
                error: err?.response?.data?.message || 'Basket validation failed',
                isDuplicate: status === 409,
                isWrongSeller: status === 403,
                existingOrderId: err?.response?.data?.existingOrderId,
            });
        } finally { setValidating(false); }
    }, [scannedBaskets]);

    const handleDuplicateScan = useCallback((basketId) => {
        toast.error(`Basket ${basketId} already scanned — do not scan same basket twice!`);
    }, []);

    const togglePackedItem = (index) => {
        setPackedItems(prev => ({ ...prev, [index]: !prev[index] }));
    };

    const allItemsPacked = selectedOrder?.items?.every((_, i) => packedItems[i]);

    const handleAttach = async () => {
        if (!selectedOrder || !scannedBasketId) return;
        if (!allItemsPacked) { toast.error('Please mark all items as packed'); return; }

        setAttaching(true);
        try {
            await sellerApi.scanAndAttachBasket({ basketId: scannedBasketId, orderId: selectedOrder.orderId });
            setAttached(true);
            setScannedBaskets(prev => [...prev, scannedBasketId]);
            setStep(STEP.READY);
            toast.success(`Basket ${scannedBasketId} attached to Order #${selectedOrder.orderId}`);
        } catch (err) {
            const message = err?.response?.data?.message || 'Failed to attach basket';
            toast.error(message);
            if (err?.response?.status === 409) {
                setValidationResult({ valid: false, isDuplicate: true, error: message });
                setStep(STEP.SCAN_BASKET);
            }
        } finally { setAttaching(false); }
    };

    const handleAddMoreBaskets = () => {
        setAddingMore(true);
        setScannedBasketId(null);
        setValidationResult(null);
        setPackedItems({});
        setStep(STEP.SCAN_BASKET);
    };

    const handleReset = () => {
        setStep(STEP.SELECT_ORDER);
        setSelectedOrder(null);
        setScannedBasketId(null);
        setValidationResult(null);
        setAttached(false);
        setCancelledWarning(false);
        setPackedItems({});
        setScannerOpen(false);
        setScannedBaskets([]);
        setAddingMore(false);
    };

    const isCOD = ['cod', 'cash'].includes(selectedOrder?.payment?.method?.toLowerCase());

    
    // Handle body scroll locking for modals
    React.useEffect(() => {
        const hasOpenModal = scannerOpen;
        if (hasOpenModal) {
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
    }, [scannerOpen]);

    return (
        <div className="space-y-5 pb-20">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-slate-900">Basket Scan & Pack</h1>
                    <p className="text-sm font-medium text-slate-500 mt-0.5">Pack bulky orders into baskets for delivery.</p>
                </div>
                {step > STEP.SELECT_ORDER && (
                    <button onClick={handleReset} className="flex items-center gap-1.5 text-xs font-black text-slate-500 hover:text-slate-700">
                        <RefreshCw size={13} />RESET
                    </button>
                )}
            </div>

            {/* Progress steps */}
            <div className="flex items-center gap-2">
                {[
                    { s: STEP.SELECT_ORDER, label: '1. Order' },
                    { s: STEP.SCAN_BASKET, label: '2. Scan' },
                    { s: STEP.PACK_ITEMS, label: '3. Pack' },
                    { s: STEP.CONFIRM, label: '4. Confirm' },
                    { s: STEP.READY, label: '5. Ready' },
                ].map(({ s, label }, i, arr) => (
                    <React.Fragment key={s}>
                        <div className={cn('flex items-center gap-1.5', step >= s ? 'text-indigo-600' : 'text-slate-400')}>
                            <div className={cn('h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-black', step >= s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400')}>
                                {step > s ? '✓' : i + 1}
                            </div>
                            <span className="text-[10px] font-black uppercase hidden sm:block">{label}</span>
                        </div>
                        {i < arr.length - 1 && <div className={cn('flex-1 h-0.5 rounded-full', step > s ? 'bg-indigo-400' : 'bg-slate-100')} />}
                    </React.Fragment>
                ))}
            </div>

            {/* Cancelled order warning */}
            <AnimatePresence>
                {cancelledWarning && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex items-start gap-3 bg-red-50 border border-red-300 rounded-2xl px-4 py-3">
                        <AlertTriangle size={18} className="text-red-600 mt-0.5 shrink-0" />
                        <div>
                            <p className="text-sm font-black text-red-800">Order Cancelled!</p>
                            <p className="text-xs font-medium text-red-600 mt-0.5">Order #{selectedOrder?.orderId} has been cancelled.{scannedBasketId && ` Return basket ${scannedBasketId} to inventory.`}</p>
                        </div>
                        <button onClick={handleReset} className="ml-auto text-red-400 hover:text-red-600 shrink-0"><X size={16} /></button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Multi-basket info banner */}
            {scannedBaskets.length > 0 && step !== STEP.READY && (
                <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-2.5">
                    <ShoppingBasket size={15} className="text-indigo-600 shrink-0" />
                    <p className="text-xs font-bold text-indigo-800">
                        {scannedBaskets.length} basket{scannedBaskets.length > 1 ? 's' : ''} scanned: {scannedBaskets.join(', ')}
                    </p>
                </div>
            )}

            {/* STEP 1: Select Order */}
            {step === STEP.SELECT_ORDER && (
                <Card className="border-none shadow-sm ring-1 ring-slate-100">
                    <div className="p-4 border-b border-slate-100">
                        <div className="relative">
                            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="text" value={orderSearch} onChange={e => setOrderSearch(e.target.value)} placeholder="Search order ID or customer name…" className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                        </div>
                    </div>
                    <div className="p-4 space-y-3">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                            <ShoppingBasket size={11} />Bulky Orders Ready to Pack
                        </p>
                        {loadingOrders ? (
                            <div className="flex justify-center py-12"><Loader2 size={28} className="text-indigo-500 animate-spin" /></div>
                        ) : filteredOrders.length === 0 ? (
                            <div className="text-center py-10 text-slate-400"><Package size={32} className="mx-auto mb-2" /><p className="text-sm font-bold">No bulky orders to pack</p></div>
                        ) : (
                            filteredOrders.map(order => (
                                <motion.button key={order._id} onClick={() => handleSelectOrder(order)} whileTap={{ scale: 0.98 }} className="w-full text-left bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 rounded-2xl p-4 transition-all group">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <p className="text-sm font-black text-slate-900">#{order.orderId}</p>
                                                <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-black uppercase', ['cod', 'cash'].includes(order.payment?.method?.toLowerCase()) ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700')}>
                                                    {['cod', 'cash'].includes(order.payment?.method?.toLowerCase()) ? 'COD' : 'PREPAID'}
                                                </span>
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-violet-100 text-violet-700">BULKY</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600"><User size={11} />{order.customer?.name}</div>
                                            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mt-0.5"><MapPin size={11} /><span className="truncate">{order.address?.address}</span></div>
                                            <p className="text-xs font-bold text-slate-700 mt-1.5">{order.items?.length} items · ₹{order.total || order.pricing?.total}</p>
                                        </div>
                                        <div className="bg-indigo-600 text-white rounded-xl p-2 transition-opacity shrink-0"><ScanLine size={16} /></div>
                                    </div>
                                </motion.button>
                            ))
                        )}
                    </div>
                </Card>
            )}

            {/* STEP 2: Scan Basket */}
            {step === STEP.SCAN_BASKET && selectedOrder && (
                <div className="space-y-3">
                    <Card className="border-none shadow-sm ring-1 ring-slate-100 p-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center"><ShoppingBasket size={18} className="text-indigo-600" /></div>
                            <div>
                                <p className="text-sm font-black text-slate-900">#{selectedOrder.orderId}</p>
                                <p className="text-xs font-semibold text-slate-600">{selectedOrder.customer?.name} · ₹{selectedOrder.total || selectedOrder.pricing?.total}</p>
                            </div>
                            <button onClick={() => setStep(STEP.SELECT_ORDER)} className="ml-auto text-slate-400 hover:text-slate-600"><X size={16} /></button>
                        </div>
                    </Card>

                    <Card className="border-none shadow-sm ring-1 ring-slate-100 p-6">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-5 flex items-center gap-2">
                            <ScanLine size={15} className="text-indigo-500" />
                            {addingMore ? 'Scan Additional Basket' : 'Scan Basket QR'}
                        </h3>
                        {validating ? (
                            <div className="flex items-center justify-center py-12 gap-3"><Loader2 size={24} className="text-indigo-500 animate-spin" /><span className="text-sm font-bold text-slate-700">Validating basket…</span></div>
                        ) : !scannerOpen && !validationResult ? (
                            <div className="flex flex-col items-center py-8 gap-4">
                                <div className="h-20 w-20 rounded-3xl bg-indigo-50 flex items-center justify-center"><ScanLine size={36} className="text-indigo-400" /></div>
                                <button onClick={() => setScannerOpen(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-black text-sm transition-colors">
                                    <Zap size={15} />OPEN SCANNER
                                </button>
                                <p className="text-xs text-slate-400 font-medium">Scan an assigned basket QR code to attach to this order</p>
                            </div>
                        ) : scannerOpen ? (
                            <QRScanner title="Scan Assigned Basket" hint="Only baskets assigned to you can be used" onScan={handleScan} onDuplicate={handleDuplicateScan} onClose={() => setScannerOpen(false)} allowManual />
                        ) : null}

                        {/* Validation errors */}
                        <AnimatePresence>
                            {validationResult && !validationResult.valid && (
                                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 bg-red-50 border border-red-200 rounded-2xl p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="h-8 w-8 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                                            {validationResult.isDuplicate ? <Ban size={16} className="text-red-600" /> : <AlertTriangle size={16} className="text-red-600" />}
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-red-800">
                                                {validationResult.isDuplicate ? 'Duplicate Basket — Already In Use!' : validationResult.isWrongSeller ? 'Wrong Basket — Not Assigned to You!' : 'Basket Validation Failed'}
                                            </p>
                                            <p className="text-xs font-medium text-red-600 mt-0.5">{validationResult.error}</p>
                                            {validationResult.existingOrderId && <p className="text-xs font-bold text-red-700 mt-1">Attached to Order #{validationResult.existingOrderId}</p>}
                                        </div>
                                    </div>
                                    <button onClick={() => { setValidationResult(null); setScannedBasketId(null); setScannerOpen(true); }} className="mt-3 w-full py-2.5 bg-red-600 text-white rounded-xl text-xs font-black hover:bg-red-700">SCAN DIFFERENT BASKET</button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </Card>
                </div>
            )}

            {/* STEP 3: Pack Items */}
            {step === STEP.PACK_ITEMS && selectedOrder && validationResult?.valid && (
                <Card className="border-none shadow-sm ring-1 ring-slate-100 p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="h-10 w-10 rounded-2xl bg-emerald-100 flex items-center justify-center"><CheckCircle2 size={20} className="text-emerald-600" /></div>
                        <div>
                            <h3 className="text-sm font-black text-slate-900">Basket Validated — {scannedBasketId}</h3>
                            <p className="text-xs font-medium text-slate-500">Check each item as you pack it into the basket.</p>
                        </div>
                    </div>

                    <div className="bg-slate-50 rounded-2xl p-4 mb-5">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                            <ListChecks size={12} />Items Checklist — {Object.values(packedItems).filter(Boolean).length}/{selectedOrder.items?.length || 0} packed
                        </p>
                        <div className="space-y-2">
                            {selectedOrder.items?.map((item, i) => (
                                <button
                                    key={i}
                                    onClick={() => togglePackedItem(i)}
                                    className={cn(
                                        'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all',
                                        packedItems[i]
                                            ? 'border-emerald-300 bg-emerald-50'
                                            : 'border-slate-200 bg-white hover:bg-slate-50'
                                    )}
                                >
                                    <div className={cn(
                                        'h-5 w-5 rounded-md flex items-center justify-center shrink-0 transition-all',
                                        packedItems[i] ? 'bg-emerald-600 text-white' : 'border-2 border-slate-300 bg-white'
                                    )}>
                                        {packedItems[i] && <CheckCircle2 size={12} />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={cn('text-sm font-bold', packedItems[i] ? 'text-emerald-800 line-through' : 'text-slate-900')}>{item.name}</p>
                                        <p className="text-[10px] font-semibold text-slate-500">Qty: {item.quantity}{item.variant ? ` · ${item.variant}` : ''}</p>
                                    </div>
                                    {packedItems[i] ? (
                                        <CheckSquare size={16} className="text-emerald-600 shrink-0" />
                                    ) : (
                                        <Square size={16} className="text-slate-300 shrink-0" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={() => setStep(STEP.CONFIRM)}
                        disabled={!allItemsPacked}
                        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl font-black py-4 text-sm transition-colors"
                    >
                        {allItemsPacked ? <><ChevronRight size={16} />PROCEED TO CONFIRM</> : <>PACK ALL ITEMS TO CONTINUE</>}
                    </button>
                    <button onClick={() => { setStep(STEP.SCAN_BASKET); setValidationResult(null); setScannedBasketId(null); }} className="mt-3 w-full py-2.5 text-xs font-black text-slate-500 hover:text-slate-700">← Scan a different basket</button>
                </Card>
            )}

            {/* STEP 4: Confirm */}
            {step === STEP.CONFIRM && selectedOrder && (
                <Card className="border-none shadow-sm ring-1 ring-slate-100 p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="h-10 w-10 rounded-2xl bg-violet-100 flex items-center justify-center"><Package size={20} className="text-violet-600" /></div>
                        <div>
                            <h3 className="text-sm font-black text-slate-900">Confirm Pack</h3>
                            <p className="text-xs font-medium text-slate-500">Review details and confirm to finalize packing.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                        <div className="bg-slate-50 rounded-2xl p-4">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Basket</p>
                            <div className="flex items-center gap-3">
                                <div className="h-12 w-12 rounded-xl bg-indigo-50 flex items-center justify-center"><ShoppingBasket size={22} className="text-indigo-500" /></div>
                                <div>
                                    <p className="text-xs font-bold text-slate-700 font-mono">{scannedBasketId}</p>
                                    <p className="text-[10px] text-slate-500">{validationResult?.basket?.size || '—'}</p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Order Details</p>
                            <div><p className="text-xs font-bold text-slate-500 uppercase">Order ID</p><p className="text-sm font-black text-slate-900">#{selectedOrder.orderId}</p></div>
                            <div><p className="text-xs font-bold text-slate-500 uppercase">Customer</p><p className="text-sm font-black text-slate-900">{selectedOrder.customer?.name}</p></div>
                            <div><p className="text-xs font-bold text-slate-500 uppercase">Payment</p>
                                <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-black uppercase', isCOD ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700')}>
                                    {isCOD ? `COD — ₹${selectedOrder.total || selectedOrder.pricing?.total}` : 'PREPAID'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-50 rounded-2xl p-4 mb-5">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Items Packed ({selectedOrder.items?.length})</p>
                        <div className="space-y-1.5">
                            {selectedOrder.items?.map((item, i) => (
                                <div key={i} className="flex items-center justify-between text-xs">
                                    <span className="font-semibold text-slate-700 flex items-center gap-1.5"><CheckCircle2 size={11} className="text-emerald-500" />{item.name}</span>
                                    <span className="font-bold text-slate-900">×{item.quantity}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <button onClick={handleAttach} disabled={attaching} className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-2xl font-black py-4 text-sm transition-colors">
                        {attaching ? <Loader2 size={18} className="animate-spin" /> : <><ShoppingBasket size={16} />CONFIRM PACK ORDER</>}
                    </button>
                    <button onClick={() => setStep(STEP.PACK_ITEMS)} className="mt-3 w-full py-2.5 text-xs font-black text-slate-500 hover:text-slate-700">← Back to items checklist</button>
                </Card>
            )}

            {/* STEP 5: Ready */}
            {step === STEP.READY && attached && (
                <Card className="border-none shadow-sm ring-1 ring-slate-100 p-6 text-center">
                    <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.5 }} className="h-16 w-16 rounded-3xl bg-emerald-500 flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 size={30} className="text-white" />
                    </motion.div>
                    <h3 className="text-xl font-black text-slate-900 mb-1">Basket Packed! 🎉</h3>
                    <p className="text-sm font-medium text-slate-500 mb-6">
                        Basket <span className="font-black text-slate-800">{scannedBasketId}</span> packed for Order <span className="font-black text-slate-800">#{selectedOrder?.orderId}</span>
                    </p>

                    {/* All scanned baskets summary */}
                    {scannedBaskets.length > 0 && (
                        <div className="bg-indigo-50 rounded-2xl p-4 mb-5">
                            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-2">Baskets for this Order ({scannedBaskets.length})</p>
                            <div className="flex flex-wrap gap-2 justify-center">
                                {scannedBaskets.map((id) => (
                                    <span key={id} className="px-3 py-1.5 bg-white rounded-xl text-[11px] font-black text-indigo-700 font-mono border border-indigo-200">{id}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="bg-slate-50 rounded-2xl p-5 mb-5 text-left space-y-3">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Packing Summary</p>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                            {[
                                { label: 'Order ID', value: `#${selectedOrder?.orderId}` },
                                { label: 'Baskets', value: `${scannedBaskets.length}` },
                                { label: 'Customer', value: selectedOrder?.customer?.name },
                                { label: 'Payment', value: isCOD ? `COD ₹${selectedOrder?.total || selectedOrder?.pricing?.total}` : 'PREPAID' },
                            ].map(({ label, value }) => (
                                <div key={label}>
                                    <p className="font-bold text-slate-500 uppercase">{label}</p>
                                    <p className="font-black text-slate-900">{value}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col gap-3">
                        <button onClick={handleAddMoreBaskets} className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black py-3.5 text-sm transition-colors">
                            <ShoppingBasket size={16} />ADD ANOTHER BASKET
                        </button>
                        <button onClick={handleReset} className="w-full py-3 bg-slate-100 text-slate-700 rounded-2xl font-black text-sm hover:bg-slate-200 transition-colors">PACK ANOTHER ORDER</button>
                    </div>
                </Card>
            )}
        </div>
    );
};

export default BasketScanAndPack;
