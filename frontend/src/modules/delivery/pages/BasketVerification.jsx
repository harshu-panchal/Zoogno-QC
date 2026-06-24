import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Card from '@/shared/components/ui/Card';
import Button from '@/shared/components/ui/Button';
import QRScanner from '@shared/components/ui/QRScanner';
import { validateScannedBasketId } from '@shared/utils/basketUtils';
import { deliveryApi } from '../services/deliveryApi';
import OtpInput from '../components/OtpInput';
import DeliverySlideButton from '../components/DeliverySlideButton';
import { toast } from 'sonner';
import {
    ShoppingBasket, ScanLine, CheckCircle2, AlertTriangle,
    Loader2, X, Package, ChevronDown, Zap, ShieldCheck,
    Navigation, Truck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import confetti from 'canvas-confetti';

const STEP = { LOADING: 0, AT_STORE: 1, SCAN_BASKETS: 2, VERIFIED: 3, IN_TRANSIT: 4, OTP: 5, DELIVERED: 6 };

const BasketVerification = () => {
    const { orderId } = useParams();
    const navigate = useNavigate();
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [step, setStep] = useState(STEP.LOADING);

    // Basket scanning
    const [expectedBaskets, setExpectedBaskets] = useState([]);
    const [scannedBaskets, setScannedBaskets] = useState([]);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scanError, setScanError] = useState(null);
    const [verifying, setVerifying] = useState(false);

    // OTP
    const [otpGenerated, setOtpGenerated] = useState(false);

    // Fetch order details
    useEffect(() => {
        const fetchOrder = async () => {
            try {
                const res = await deliveryApi.getOrderDetails(orderId);
                const ord = res.data?.result;
                setOrder(ord);
                // Extract expected baskets from order
                const baskets = ord?.baskets || [];
                setExpectedBaskets(baskets);
                setStep(STEP.AT_STORE);
            } catch (err) {
                toast.error("Failed to load order details");
                navigate('/delivery/dashboard');
            } finally {
                setLoading(false);
            }
        };
        if (orderId) fetchOrder();
    }, [orderId, navigate]);

    const allScanned = expectedBaskets.length > 0 && scannedBaskets.length >= expectedBaskets.length;
    const remaining = expectedBaskets.length - scannedBaskets.length;

    const handleScan = useCallback(async (raw) => {
        const { valid, error, basketId } = validateScannedBasketId(raw);
        if (!valid) { toast.error(error); return; }

        // Duplicate check
        if (scannedBaskets.includes(basketId)) {
            toast.error(`Basket ${basketId} already scanned!`);
            return;
        }

        // Check if this basket belongs to this order
        const expectedIds = expectedBaskets.map(b => b.basketId || b);
        if (!expectedIds.includes(basketId)) {
            setScanError({
                basketId,
                message: `Basket ${basketId} does not belong to this order`,
            });
            setScannerOpen(false);
            return;
        }

        setScannerOpen(false);
        setScanError(null);
        setScannedBaskets(prev => [...prev, basketId]);
        toast.success(`Basket ${basketId} verified ✓`);

        // Auto-advance if all scanned
        const newScanned = [...scannedBaskets, basketId];
        if (newScanned.length >= expectedBaskets.length) {
            // All baskets scanned — auto advance
            setTimeout(() => setStep(STEP.VERIFIED), 500);
        }
    }, [scannedBaskets, expectedBaskets]);

    const handleVerifyAll = async () => {
        setVerifying(true);
        try {
            await deliveryApi.verifyBaskets(orderId, { basketIds: scannedBaskets });
            setStep(STEP.IN_TRANSIT);
            toast.success("All baskets verified! Out for delivery.");
        } catch (err) {
            toast.error(err?.response?.data?.message || "Verification failed");
        } finally {
            setVerifying(false);
        }
    };

    const handleOtpGenerated = () => {
        setOtpGenerated(true);
        toast.success("OTP sent to customer!");
    };

    const handleOtpValidationSuccess = () => {
        setStep(STEP.DELIVERED);
        confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#818cf8', '#3b82f6', '#f59e0b'],
        });
        setTimeout(() => navigate('/delivery/dashboard'), 3000);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <Loader2 className="animate-spin text-indigo-500" size={48} />
            </div>
        );
    }

    if (!order) return null;

    const orderShortId = typeof order.orderId === 'string' ? order.orderId.slice(-8) : order.orderId;

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-28 font-['Poppins',_sans-serif]">
            {/* Header */}
            <div className="bg-white/85 backdrop-blur-md sticky top-0 z-30 px-4 py-3 flex items-center justify-between border-b border-slate-100">
                <div className="flex items-center">
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="mr-2">
                        <ChevronDown className="rotate-90 text-slate-800" size={24} />
                    </Button>
                    <div>
                        <h1 className="text-base font-bold text-slate-800">Basket Verify #{orderShortId}</h1>
                        <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Bulky Order</p>
                    </div>
                </div>
                <span className={cn(
                    'text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wide',
                    step >= STEP.DELIVERED ? 'bg-emerald-100 text-emerald-700' :
                    step >= STEP.IN_TRANSIT ? 'bg-amber-100 text-amber-700' :
                    'bg-indigo-100 text-indigo-700'
                )}>
                    {step >= STEP.DELIVERED ? 'Delivered' : step >= STEP.IN_TRANSIT ? 'Out for Delivery' : 'At Store'}
                </span>
            </div>

            <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
                {/* Step Indicator */}
                <div className="flex items-center justify-between bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
                    {[
                        { id: STEP.AT_STORE, icon: Package, label: 'At Store' },
                        { id: STEP.SCAN_BASKETS, icon: ScanLine, label: 'Scan' },
                        { id: STEP.IN_TRANSIT, icon: Truck, label: 'Deliver' },
                        { id: STEP.DELIVERED, icon: CheckCircle2, label: 'Done' },
                    ].map(({ id, icon: Icon, label }, i, arr) => (
                        <React.Fragment key={id}>
                            <div className="flex flex-col items-center gap-1">
                                <div className={cn(
                                    'h-8 w-8 rounded-full flex items-center justify-center transition-all',
                                    step >= id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'
                                )}>
                                    {step > id ? <CheckCircle2 size={14} /> : <Icon size={14} />}
                                </div>
                                <span className={cn('text-[9px] font-black uppercase', step >= id ? 'text-indigo-600' : 'text-slate-400')}>{label}</span>
                            </div>
                            {i < arr.length - 1 && (
                                <div className={cn('flex-1 h-0.5 rounded-full mx-1', step > id ? 'bg-indigo-400' : 'bg-slate-100')} />
                            )}
                        </React.Fragment>
                    ))}
                </div>

                {/* AT STORE — See what to collect */}
                {step === STEP.AT_STORE && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                        <Card className="border-none shadow-sm ring-1 ring-slate-100 p-5">
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <Package size={15} className="text-indigo-500" />Baskets to Collect
                            </h3>
                            <p className="text-xs font-medium text-slate-500 mb-4">
                                This order has <span className="font-black text-indigo-700">{expectedBaskets.length}</span> basket{expectedBaskets.length > 1 ? 's' : ''}. Scan each one to verify.
                            </p>
                            <div className="space-y-2 mb-5">
                                {expectedBaskets.map((basket, i) => {
                                    const id = basket.basketId || basket;
                                    const isScanned = scannedBaskets.includes(id);
                                    return (
                                        <div key={i} className={cn(
                                            'flex items-center gap-3 p-3 rounded-xl border transition-all',
                                            isScanned ? 'border-emerald-300 bg-emerald-50' : 'border-slate-100 bg-slate-50'
                                        )}>
                                            <div className={cn(
                                                'h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
                                                isScanned ? 'bg-emerald-600' : 'bg-slate-200'
                                            )}>
                                                {isScanned ? <CheckCircle2 size={14} className="text-white" /> : <ShoppingBasket size={14} className="text-slate-500" />}
                                            </div>
                                            <div>
                                                <p className="text-xs font-black text-slate-900 font-mono">{id}</p>
                                                <p className="text-[10px] font-semibold text-slate-500">{basket.size || 'Standard'}</p>
                                            </div>
                                            <span className={cn(
                                                'ml-auto text-[10px] font-black uppercase px-2 py-0.5 rounded-full',
                                                isScanned ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                                            )}>
                                                {isScanned ? 'SCANNED' : 'PENDING'}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                            <button
                                onClick={() => { setStep(STEP.SCAN_BASKETS); setScannerOpen(true); }}
                                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black py-3.5 text-sm transition-colors"
                            >
                                <ScanLine size={16} />START SCANNING ({expectedBaskets.length} basket{expectedBaskets.length > 1 ? 's' : ''})
                            </button>
                        </Card>

                        {/* Order Info */}
                        <Card className="border-none shadow-sm ring-1 ring-slate-100 p-4">
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="bg-slate-50 rounded-xl p-3">
                                    <p className="text-slate-500 font-bold uppercase tracking-wider mb-1">Customer</p>
                                    <p className="font-black text-slate-900">{order.customer?.name}</p>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-3">
                                    <p className="text-slate-500 font-bold uppercase tracking-wider mb-1">Items</p>
                                    <p className="font-black text-slate-900">{order.items?.length} items</p>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-3">
                                    <p className="text-slate-500 font-bold uppercase tracking-wider mb-1">Amount</p>
                                    <p className="font-black text-slate-900">₹{order.pricing?.total || order.total}</p>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-3">
                                    <p className="text-slate-500 font-bold uppercase tracking-wider mb-1">Payment</p>
                                    <p className="font-black text-slate-900">
                                        {['cod', 'cash'].includes(order.payment?.method?.toLowerCase()) ? 'COD' : 'PREPAID'}
                                    </p>
                                </div>
                            </div>
                        </Card>
                    </motion.div>
                )}

                {/* SCAN BASKETS */}
                {step === STEP.SCAN_BASKETS && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                        {/* Progress */}
                        <Card className="border-none shadow-sm ring-1 ring-slate-100 p-4">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-xs font-black text-slate-900 uppercase tracking-wider">
                                    Scanning Progress
                                </p>
                                <p className="text-xs font-black text-indigo-600">
                                    {scannedBaskets.length}/{expectedBaskets.length}
                                </p>
                            </div>
                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-indigo-600 rounded-full"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${(scannedBaskets.length / expectedBaskets.length) * 100}%` }}
                                    transition={{ duration: 0.5 }}
                                />
                            </div>
                            <div className="mt-3 space-y-1.5">
                                {expectedBaskets.map((basket, i) => {
                                    const id = basket.basketId || basket;
                                    const isScanned = scannedBaskets.includes(id);
                                    return (
                                        <div key={i} className="flex items-center gap-2 text-xs">
                                            {isScanned ? <CheckCircle2 size={12} className="text-emerald-600" /> : <div className="h-3 w-3 rounded-full border-2 border-slate-300" />}
                                            <span className={cn('font-mono font-bold', isScanned ? 'text-emerald-700 line-through' : 'text-slate-700')}>{id}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>

                        {/* Scanner */}
                        <Card className="border-none shadow-sm ring-1 ring-slate-100 p-6">
                            {scannerOpen ? (
                                <QRScanner
                                    title={`Scan Basket (${scannedBaskets.length + 1} of ${expectedBaskets.length})`}
                                    hint="Scan the QR code on the basket"
                                    onScan={handleScan}
                                    onDuplicate={(id) => toast.error(`Basket ${id} already scanned!`)}
                                    onClose={() => setScannerOpen(false)}
                                    allowManual
                                />
                            ) : (
                                <div className="flex flex-col items-center py-6 gap-4">
                                    {allScanned ? (
                                        <>
                                            <div className="h-16 w-16 rounded-3xl bg-emerald-100 flex items-center justify-center">
                                                <CheckCircle2 size={30} className="text-emerald-600" />
                                            </div>
                                            <p className="text-sm font-black text-emerald-800">All baskets scanned!</p>
                                        </>
                                    ) : (
                                        <>
                                            <div className="h-16 w-16 rounded-3xl bg-indigo-50 flex items-center justify-center">
                                                <ScanLine size={28} className="text-indigo-400" />
                                            </div>
                                            <button onClick={() => setScannerOpen(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-black text-sm transition-colors">
                                                <Zap size={15} />SCAN NEXT BASKET ({remaining} left)
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Scan error */}
                            <AnimatePresence>
                                {scanError && (
                                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 bg-red-50 border border-red-200 rounded-2xl p-4">
                                        <div className="flex items-start gap-3">
                                            <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />
                                            <div>
                                                <p className="text-sm font-black text-red-800">Wrong Basket!</p>
                                                <p className="text-xs font-medium text-red-600">{scanError.message}</p>
                                            </div>
                                        </div>
                                        <button onClick={() => { setScanError(null); setScannerOpen(true); }} className="mt-3 w-full py-2.5 bg-red-600 text-white rounded-xl text-xs font-black hover:bg-red-700">
                                            SCAN CORRECT BASKET
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </Card>

                        {/* Cannot proceed warning */}
                        {!allScanned && scannedBaskets.length > 0 && (
                            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                                <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                                <p className="text-xs font-bold text-amber-800">
                                    {remaining} more basket{remaining > 1 ? 's' : ''} remaining. Scan all baskets to proceed.
                                </p>
                            </div>
                        )}
                    </motion.div>
                )}

                {/* VERIFIED — Confirm all baskets */}
                {step === STEP.VERIFIED && (
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                        <Card className="border-none shadow-sm ring-1 ring-emerald-200 p-6 text-center">
                            <div className="h-14 w-14 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                                <CheckCircle2 size={28} className="text-emerald-600" />
                            </div>
                            <h3 className="text-lg font-black text-slate-900 mb-1">All Baskets Verified! ✓</h3>
                            <p className="text-sm font-medium text-slate-500 mb-5">
                                {scannedBaskets.length} basket{scannedBaskets.length > 1 ? 's' : ''} confirmed for Order #{orderShortId}
                            </p>
                            <div className="flex flex-wrap gap-2 justify-center mb-6">
                                {scannedBaskets.map((id) => (
                                    <span key={id} className="px-3 py-1.5 bg-emerald-50 rounded-xl text-[11px] font-black text-emerald-700 font-mono border border-emerald-200">
                                        {id} ✓
                                    </span>
                                ))}
                            </div>
                            <button
                                onClick={handleVerifyAll}
                                disabled={verifying}
                                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-2xl font-black py-4 text-sm transition-colors"
                            >
                                {verifying ? <Loader2 size={18} className="animate-spin" /> : <><Truck size={16} />CONFIRM & START DELIVERY</>}
                            </button>
                        </Card>
                    </motion.div>
                )}

                {/* IN TRANSIT — OTP Flow */}
                {(step === STEP.IN_TRANSIT || step === STEP.OTP) && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                        <Card className="border-none shadow-sm ring-1 ring-indigo-100 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                                    <Truck size={18} className="text-indigo-600" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-slate-900">Out for Delivery</h3>
                                    <p className="text-xs font-medium text-slate-500">{scannedBaskets.length} basket{scannedBaskets.length > 1 ? 's' : ''} verified</p>
                                </div>
                            </div>
                        </Card>

                        <Card className="p-6 border-none shadow-sm ring-1 ring-slate-100">
                            {!otpGenerated ? (
                                <>
                                    <div className="flex items-center mb-4 text-slate-800">
                                        <ShieldCheck className="mr-2 text-indigo-600" size={24} />
                                        <h3 className="font-bold text-lg">Customer OTP Verification</h3>
                                    </div>
                                    <p className="text-slate-500 text-sm mb-4">
                                        Slide to generate an OTP for the customer. They must verify receipt of all {scannedBaskets.length} basket{scannedBaskets.length > 1 ? 's' : ''}.
                                    </p>
                                    <DeliverySlideButton
                                        orderId={orderId}
                                        onSuccess={handleOtpGenerated}
                                        onError={(err) => console.error("OTP generation error:", err)}
                                    />
                                </>
                            ) : (
                                <OtpInput
                                    orderId={orderId}
                                    onSuccess={handleOtpValidationSuccess}
                                    onError={(err) => console.error("OTP validation error:", err)}
                                />
                            )}
                        </Card>
                    </motion.div>
                )}

                {/* DELIVERED */}
                {step === STEP.DELIVERED && (
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-8">
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                            className="bg-white rounded-full p-6 shadow-xl mb-6 inline-block"
                        >
                            <CheckCircle2 className="text-emerald-500 w-24 h-24" strokeWidth={1.5} />
                        </motion.div>
                        <h1 className="text-3xl font-bold text-slate-900 mb-2">Delivery Successful!</h1>
                        <p className="text-slate-500 mb-2">Order #{orderShortId} — {scannedBaskets.length} basket{scannedBaskets.length > 1 ? 's' : ''} delivered.</p>
                        <p className="text-xs text-slate-400">Redirecting to dashboard…</p>
                    </motion.div>
                )}
            </div>
        </div>
    );
};

export default BasketVerification;
