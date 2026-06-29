import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Card from '@shared/components/ui/Card';
import QRScanner from '@shared/components/ui/QRScanner';
import QRCodeDisplay from '@shared/components/ui/QRCodeDisplay';
import {
    validateScannedBagId,
    printBagLabel,
    generateBagQRDataURL,
} from '@shared/utils/qrBagUtils';
import { sellerApi } from '../services/sellerApi';
import { toast } from 'sonner';
import {
    Package, ScanLine, Search, CheckCircle2, AlertTriangle, Printer,
    Loader2, X, User, MapPin, QrCode, Zap, RefreshCw, Ban,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const MOCK_ORDERS = [
    { _id: 'o1', orderId: 'ORD-1055', customer: { name: 'Priya Sharma', phone: '+91 98765 43210' }, total: 345, payment: { method: 'cod' }, address: { address: '12 MG Road, Bengaluru' }, items: [{ name: 'Milk 1L', quantity: 2 }, { name: 'Bread', quantity: 1 }], status: 'confirmed' },
    { _id: 'o2', orderId: 'ORD-1056', customer: { name: 'Rahul Verma', phone: '+91 87654 32109' }, total: 812, payment: { method: 'online' }, address: { address: '5 Park Street, Mumbai' }, items: [{ name: 'Eggs x12', quantity: 1 }, { name: 'Butter 500g', quantity: 2 }], status: 'confirmed' },
    { _id: 'o3', orderId: 'ORD-1057', customer: { name: 'Anjali Singh', phone: '+91 76543 21098' }, total: 230, payment: { method: 'cod' }, address: { address: '8 Connaught Place, Delhi' }, items: [{ name: 'Rice 5kg', quantity: 1 }], status: 'confirmed' },
];

const STEP = { SELECT_ORDER: 1, SCAN_BAG: 2, CONFIRM: 3, LABEL: 4 };

const BagScanAndPack = () => {
    const [step, setStep] = useState(STEP.SELECT_ORDER);
    const [orders] = useState(MOCK_ORDERS);
    const [orderSearch, setOrderSearch] = useState('');
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scannedBagId, setScannedBagId] = useState(null);
    const [validating, setValidating] = useState(false);
    const [validationResult, setValidationResult] = useState(null);
    const [attaching, setAttaching] = useState(false);
    const [attached, setAttached] = useState(false);
    const [qrDataUrl, setQrDataUrl] = useState(null);
    const [cancelledWarning, setCancelledWarning] = useState(false);

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
        o.orderId.toLowerCase().includes(orderSearch.toLowerCase()) ||
        o.customer?.name?.toLowerCase().includes(orderSearch.toLowerCase())
    );

    const handleSelectOrder = (order) => {
        setSelectedOrder(order);
        setStep(STEP.SCAN_BAG);
        setScannedBagId(null);
        setValidationResult(null);
        setAttached(false);
        setCancelledWarning(false);
    };

    const handleScan = useCallback(async (bagId) => {
        const { valid, error, bagId: cleanId } = validateScannedBagId(bagId);
        if (!valid) { toast.error(error); return; }

        setScannerOpen(false);
        setScannedBagId(cleanId);
        setValidating(true);
        setValidationResult(null);

        try {
            const res = await sellerApi.validateBag(cleanId);
            setValidationResult({ valid: true, bag: res.data?.result });
            setStep(STEP.CONFIRM);
        } catch (err) {
            const status = err?.response?.status;
            setValidationResult({
                valid: false,
                error: err?.response?.data?.message || 'Bag validation failed',
                isDuplicate: status === 409,
                isWrongSeller: status === 403,
                existingOrderId: err?.response?.data?.existingOrderId,
            });
        } finally { setValidating(false); }
    }, []);

    const handleDuplicateScan = useCallback((bagId) => {
        toast.error(`Bag ${bagId} already scanned — do not scan same bag twice!`);
    }, []);

    const handleAttach = async () => {
        if (!selectedOrder || !scannedBagId) return;
        setAttaching(true);
        try {
            await sellerApi.scanAndAttachBag({ bagId: scannedBagId, orderId: selectedOrder.orderId });
            setAttached(true);
            setStep(STEP.LABEL);
            const url = await generateBagQRDataURL(scannedBagId);
            setQrDataUrl(url);
            toast.success(`Bag ${scannedBagId} attached to Order #${selectedOrder.orderId}`);
        } catch (err) {
            const message = err?.response?.data?.message || 'Failed to attach bag';
            toast.error(message);
            if (err?.response?.status === 409) {
                setValidationResult({ valid: false, isDuplicate: true, error: message });
                setStep(STEP.SCAN_BAG);
            }
        } finally { setAttaching(false); }
    };

    const handlePrintLabel = async () => {
        if (!selectedOrder || !scannedBagId || !qrDataUrl) return;
        await printBagLabel({
            orderId: selectedOrder.orderId,
            bagId: scannedBagId,
            customerName: selectedOrder.customer?.name,
            paymentMethod: selectedOrder.payment?.method,
            total: selectedOrder.total,
        }, qrDataUrl);
    };

    const handleReset = () => {
        setStep(STEP.SELECT_ORDER);
        setSelectedOrder(null);
        setScannedBagId(null);
        setValidationResult(null);
        setAttached(false);
        setCancelledWarning(false);
        setQrDataUrl(null);
        setScannerOpen(false);
    };

    const isCOD = ['cod', 'cash'].includes(selectedOrder?.payment?.method?.toLowerCase());

    return (
        <div className="space-y-5 pb-20">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-slate-900">Scan & Pack</h1>
                    <p className="text-sm font-medium text-slate-500 mt-0.5">Attach a QR bag to an order and generate a delivery label.</p>
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
                    { s: STEP.SCAN_BAG, label: '2. Scan' },
                    { s: STEP.CONFIRM, label: '3. Confirm' },
                    { s: STEP.LABEL, label: '4. Label' },
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
                            <p className="text-xs font-medium text-red-600 mt-0.5">Order #{selectedOrder?.orderId} has been cancelled.{scannedBagId && ` Return bag ${scannedBagId} to inventory.`}</p>
                        </div>
                        <button onClick={handleReset} className="ml-auto text-red-400 hover:text-red-600 shrink-0"><X size={16} /></button>
                    </motion.div>
                )}
            </AnimatePresence>

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
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Confirmed Orders Ready to Pack</p>
                        {filteredOrders.length === 0 ? (
                            <div className="text-center py-10 text-slate-400"><Package size={32} className="mx-auto mb-2" /><p className="text-sm font-bold">No confirmed orders</p></div>
                        ) : (
                            filteredOrders.map(order => (
                                <motion.button key={order._id} onClick={() => handleSelectOrder(order)} whileTap={{ scale: 0.98 }} className="w-full text-left bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 rounded-2xl p-4 transition-all group">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <p className="text-sm font-black text-slate-900">#{order.orderId}</p>
                                                <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-black uppercase', isCOD ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700')}>
                                                    {order.payment?.method === 'cod' ? 'COD' : 'PREPAID'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600"><User size={11} />{order.customer?.name}</div>
                                            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mt-0.5"><MapPin size={11} /><span className="truncate">{order.address?.address}</span></div>
                                            <p className="text-xs font-bold text-slate-700 mt-1.5">{order.items?.length} items · ₹{order.total}</p>
                                        </div>
                                        <div className="bg-indigo-600 text-white rounded-xl p-2 transition-opacity shrink-0"><ScanLine size={16} /></div>
                                    </div>
                                </motion.button>
                            ))
                        )}
                    </div>
                </Card>
            )}

            {/* STEP 2: Scan Bag */}
            {step === STEP.SCAN_BAG && selectedOrder && (
                <div className="space-y-3">
                    <Card className="border-none shadow-sm ring-1 ring-slate-100 p-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center"><Package size={18} className="text-indigo-600" /></div>
                            <div>
                                <p className="text-sm font-black text-slate-900">#{selectedOrder.orderId}</p>
                                <p className="text-xs font-semibold text-slate-600">{selectedOrder.customer?.name} · ₹{selectedOrder.total}</p>
                            </div>
                            <button onClick={() => setStep(STEP.SELECT_ORDER)} className="ml-auto text-slate-400 hover:text-slate-600"><X size={16} /></button>
                        </div>
                    </Card>

                    <Card className="border-none shadow-sm ring-1 ring-slate-100 p-6">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-5 flex items-center gap-2"><QrCode size={15} className="text-indigo-500" />Scan QR Bag</h3>
                        {validating ? (
                            <div className="flex items-center justify-center py-12 gap-3"><Loader2 size={24} className="text-indigo-500 animate-spin" /><span className="text-sm font-bold text-slate-700">Validating bag…</span></div>
                        ) : !scannerOpen && !validationResult ? (
                            <div className="flex flex-col items-center py-8 gap-4">
                                <div className="h-20 w-20 rounded-3xl bg-indigo-50 flex items-center justify-center"><ScanLine size={36} className="text-indigo-400" /></div>
                                <button onClick={() => setScannerOpen(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-black text-sm transition-colors">
                                    <Zap size={15} />OPEN SCANNER
                                </button>
                                <p className="text-xs text-slate-400 font-medium">Scan an assigned bag QR code to attach to this order</p>
                            </div>
                        ) : scannerOpen ? (
                            <QRScanner title="Scan Assigned Bag" hint="Only bags assigned to you can be used" onScan={handleScan} onDuplicate={handleDuplicateScan} onClose={() => setScannerOpen(false)} allowManual />
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
                                                {validationResult.isDuplicate ? 'Duplicate Bag — Already In Use!' : validationResult.isWrongSeller ? 'Wrong Bag — Not Assigned to You!' : 'Bag Validation Failed'}
                                            </p>
                                            <p className="text-xs font-medium text-red-600 mt-0.5">{validationResult.error}</p>
                                            {validationResult.existingOrderId && <p className="text-xs font-bold text-red-700 mt-1">Attached to Order #{validationResult.existingOrderId}</p>}
                                        </div>
                                    </div>
                                    <button onClick={() => { setValidationResult(null); setScannedBagId(null); setScannerOpen(true); }} className="mt-3 w-full py-2.5 bg-red-600 text-white rounded-xl text-xs font-black hover:bg-red-700">SCAN DIFFERENT BAG</button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </Card>
                </div>
            )}

            {/* STEP 3: Confirm */}
            {step === STEP.CONFIRM && selectedOrder && validationResult?.valid && (
                <Card className="border-none shadow-sm ring-1 ring-slate-100 p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="h-10 w-10 rounded-2xl bg-emerald-100 flex items-center justify-center"><CheckCircle2 size={20} className="text-emerald-600" /></div>
                        <div>
                            <h3 className="text-sm font-black text-slate-900">Bag Validated!</h3>
                            <p className="text-xs font-medium text-slate-500">Review and confirm to pack this order.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                        <div className="bg-slate-50 rounded-2xl p-4">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">QR Bag</p>
                            <QRCodeDisplay bagId={scannedBagId} size={100} showActions={false} />
                            <p className="text-xs font-bold text-slate-700 mt-2 font-mono">{scannedBagId}</p>
                        </div>
                        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Order Details</p>
                            <div><p className="text-xs font-bold text-slate-500 uppercase">Order ID</p><p className="text-sm font-black text-slate-900">#{selectedOrder.orderId}</p></div>
                            <div><p className="text-xs font-bold text-slate-500 uppercase">Customer</p><p className="text-sm font-black text-slate-900">{selectedOrder.customer?.name}</p><p className="text-xs text-slate-500">{selectedOrder.customer?.phone}</p></div>
                            <div><p className="text-xs font-bold text-slate-500 uppercase">Payment</p>
                                <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-black uppercase', isCOD ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700')}>
                                    {isCOD ? `COD — ₹${selectedOrder.total}` : 'PREPAID'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-50 rounded-2xl p-4 mb-5">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Items in Order</p>
                        <div className="space-y-1.5">
                            {selectedOrder.items?.map((item, i) => (
                                <div key={i} className="flex items-center justify-between text-xs">
                                    <span className="font-semibold text-slate-700">{item.name}</span>
                                    <span className="font-bold text-slate-900">×{item.quantity}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <button onClick={handleAttach} disabled={attaching} className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-2xl font-black py-4 text-sm transition-colors">
                        {attaching ? <Loader2 size={18} className="animate-spin" /> : <><Package size={16} />CONFIRM PACK ORDER</>}
                    </button>
                    <button onClick={() => { setStep(STEP.SCAN_BAG); setValidationResult(null); setScannedBagId(null); }} className="mt-3 w-full py-2.5 text-xs font-black text-slate-500 hover:text-slate-700">← Scan a different bag</button>
                </Card>
            )}

            {/* STEP 4: Label */}
            {step === STEP.LABEL && attached && (
                <Card className="border-none shadow-sm ring-1 ring-slate-100 p-6 text-center">
                    <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.5 }} className="h-16 w-16 rounded-3xl bg-emerald-500 flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 size={30} className="text-white" />
                    </motion.div>
                    <h3 className="text-xl font-black text-slate-900 mb-1">Order Packed! 🎉</h3>
                    <p className="text-sm font-medium text-slate-500 mb-6">
                        Bag <span className="font-black text-slate-800">{scannedBagId}</span> attached to Order <span className="font-black text-slate-800">#{selectedOrder?.orderId}</span>
                    </p>

                    <div className="bg-slate-50 rounded-2xl p-5 mb-5 text-left space-y-3">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Delivery Label Preview</p>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                            {[{ label: 'Order ID', value: `#${selectedOrder?.orderId}` }, { label: 'Bag ID', value: scannedBagId }, { label: 'Customer', value: selectedOrder?.customer?.name }, { label: 'Payment', value: isCOD ? `COD ₹${selectedOrder?.total}` : 'PREPAID' }].map(({ label, value }) => (
                                <div key={label}>
                                    <p className="font-bold text-slate-500 uppercase">{label}</p>
                                    <p className="font-black text-slate-900">{value}</p>
                                </div>
                            ))}
                        </div>
                        {qrDataUrl && <div className="flex justify-center mt-2"><img src={qrDataUrl} alt="Bag QR" className="h-16 w-16 rounded-xl border border-slate-200" /></div>}
                    </div>

                    <div className="flex flex-col gap-3">
                        <button onClick={handlePrintLabel} className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black py-3.5 text-sm transition-colors">
                            <Printer size={16} />PRINT DELIVERY LABEL
                        </button>
                        <button onClick={handleReset} className="w-full py-3 bg-slate-100 text-slate-700 rounded-2xl font-black text-sm hover:bg-slate-200 transition-colors">PACK ANOTHER ORDER</button>
                    </div>
                </Card>
            )}
        </div>
    );
};

export default BagScanAndPack;
