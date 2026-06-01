import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Html5Qrcode } from 'html5-qrcode';
import {
    Camera,
    CameraOff,
    Flashlight,
    X,
    AlertTriangle,
    CheckCircle2,
    Keyboard,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * QRScanner — Reusable camera-based QR scanner component.
 *
 * Props:
 *  onScan(bagId: string)   — called with valid scanned value
 *  onError(err)            — called on camera/scan errors
 *  onDuplicate(bagId)      — called if same value scanned within 2s (duplicate guard)
 *  onClose()               — called when user dismisses scanner
 *  expectedBagId           — if provided, validates scanned value against this
 *  allowManual             — show manual text input fallback (default true)
 *  title                   — scanner header label
 *  hint                    — subtext hint below scanner
 */
const QRScanner = ({
    onScan,
    onError,
    onDuplicate,
    onClose,
    expectedBagId,
    allowManual = true,
    title = 'Scan QR Bag',
    hint = 'Point camera at the QR code on the paper bag',
}) => {
    const scannerRef = useRef(null);
    const lastScannedRef = useRef(null);
    const lastScannedTimeRef = useRef(0);
    const containerId = useRef(`qr-scanner-${Math.random().toString(36).slice(2)}`);

    const [cameraStarted, setCameraStarted] = useState(false);
    const [cameraError, setCameraError] = useState(null);
    const [scanResult, setScanResult] = useState(null); // { bagId, isValid, error }
    const [manualMode, setManualMode] = useState(false);
    const [manualInput, setManualInput] = useState('');
    const [scanning, setScanning] = useState(false);
    const [torchOn, setTorchOn] = useState(false);

    // Start camera scanner
    useEffect(() => {
        if (manualMode) return;

        let html5QrCode = null;

        const startScanner = async () => {
            try {
                html5QrCode = new Html5Qrcode(containerId.current);
                scannerRef.current = html5QrCode;

                await html5QrCode.start(
                    { facingMode: 'environment' },
                    {
                        fps: 10,
                        qrbox: { width: 220, height: 220 },
                        aspectRatio: 1.0,
                    },
                    (decodedText) => handleScannedValue(decodedText),
                    () => {} // ignore per-frame errors
                );

                setCameraStarted(true);
                setCameraError(null);
            } catch (err) {
                setCameraError('Camera not available. Use manual entry below.');
                if (onError) onError(err);
            }
        };

        startScanner();

        return () => {
            if (html5QrCode) {
                try {
                    html5QrCode.stop().catch(() => {});
                } catch (e) {
                    // Ignore synchronous errors like 'Cannot stop, scanner is not running'
                }
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [manualMode]);

    const handleScannedValue = useCallback(
        (value) => {
            const trimmed = value?.trim();
            if (!trimmed) return;

            const now = Date.now();
            // Duplicate guard: same value within 2 seconds
            if (
                trimmed === lastScannedRef.current &&
                now - lastScannedTimeRef.current < 2000
            ) {
                if (onDuplicate) onDuplicate(trimmed);
                return;
            }

            lastScannedRef.current = trimmed;
            lastScannedTimeRef.current = now;

            // Ownership check
            if (expectedBagId && trimmed !== expectedBagId) {
                setScanResult({
                    bagId: trimmed,
                    isValid: false,
                    error: `Wrong bag! Expected ${expectedBagId} but scanned ${trimmed}`,
                });
                return;
            }

            setScanResult({ bagId: trimmed, isValid: true, error: null });
            // Stop camera after successful scan
            if (scannerRef.current) {
                try {
                    scannerRef.current.stop().catch(() => {});
                } catch (e) {
                    // Ignore sync errors
                }
            }
            if (onScan) onScan(trimmed);
        },
        [expectedBagId, onDuplicate, onScan]
    );

    const handleManualSubmit = (e) => {
        e.preventDefault();
        const trimmed = manualInput.trim();
        if (!trimmed) return;
        handleScannedValue(trimmed);
    };

    const handleRetry = () => {
        setScanResult(null);
        lastScannedRef.current = null;
    };

    return (
        <div className="flex flex-col items-center w-full max-w-sm mx-auto select-none">
            {/* Header */}
            <div className="w-full flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-base font-black text-slate-900">{title}</h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">{hint}</p>
                </div>
                <div className="flex items-center gap-2">
                    {allowManual && (
                        <button
                            type="button"
                            onClick={() => setManualMode((m) => !m)}
                            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                            title="Manual entry"
                        >
                            <Keyboard size={16} />
                        </button>
                    )}
                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 rounded-xl bg-slate-100 hover:bg-red-100 hover:text-red-600 text-slate-600 transition-colors"
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>
            </div>

            {!manualMode ? (
                <>
                    {/* Camera container */}
                    <div className="relative w-full rounded-2xl overflow-hidden bg-black shadow-xl">
                        <div
                            id={containerId.current}
                            className="w-full"
                            style={{ minHeight: 240 }}
                        />

                        {/* Scanning overlay */}
                        {cameraStarted && !scanResult && (
                            <div className="absolute inset-0 pointer-events-none">
                                {/* Corner brackets */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="relative w-44 h-44">
                                        <div className="absolute top-0 left-0 w-8 h-8 border-t-3 border-l-3 border-white rounded-tl-lg" />
                                        <div className="absolute top-0 right-0 w-8 h-8 border-t-3 border-r-3 border-white rounded-tr-lg" />
                                        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-3 border-l-3 border-white rounded-bl-lg" />
                                        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-3 border-r-3 border-white rounded-br-lg" />
                                        {/* Animated scan line */}
                                        <motion.div
                                            className="absolute left-1 right-1 h-0.5 bg-green-400 rounded-full shadow-lg shadow-green-400/50"
                                            animate={{ top: ['10%', '90%', '10%'] }}
                                            transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Camera error */}
                        {cameraError && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 p-6 text-center">
                                <CameraOff size={36} className="text-slate-400 mb-3" />
                                <p className="text-white text-sm font-bold">{cameraError}</p>
                                <button
                                    onClick={() => setManualMode(true)}
                                    className="mt-4 px-4 py-2 bg-white text-slate-900 text-xs font-black rounded-xl"
                                >
                                    USE MANUAL ENTRY
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Scan result overlay */}
                    <AnimatePresence>
                        {scanResult && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className={cn(
                                    'w-full mt-3 rounded-2xl p-4 flex items-start gap-3',
                                    scanResult.isValid
                                        ? 'bg-green-50 border border-green-200'
                                        : 'bg-red-50 border border-red-200'
                                )}
                            >
                                {scanResult.isValid ? (
                                    <CheckCircle2 size={20} className="text-green-600 mt-0.5 shrink-0" />
                                ) : (
                                    <AlertTriangle size={20} className="text-red-600 mt-0.5 shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                    <p
                                        className={cn(
                                            'text-sm font-black truncate',
                                            scanResult.isValid ? 'text-green-800' : 'text-red-800'
                                        )}
                                    >
                                        {scanResult.isValid ? scanResult.bagId : 'Scan Failed'}
                                    </p>
                                    {scanResult.error && (
                                        <p className="text-xs text-red-600 font-medium mt-0.5">
                                            {scanResult.error}
                                        </p>
                                    )}
                                </div>
                                {!scanResult.isValid && (
                                    <button
                                        onClick={handleRetry}
                                        className="text-xs font-black text-red-700 bg-red-100 px-3 py-1.5 rounded-lg shrink-0"
                                    >
                                        RETRY
                                    </button>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Camera status */}
                    <div className="mt-3 flex items-center gap-2">
                        <span
                            className={cn(
                                'h-2 w-2 rounded-full',
                                cameraStarted && !cameraError ? 'bg-green-500 animate-pulse' : 'bg-slate-300'
                            )}
                        />
                        <span className="text-xs font-semibold text-slate-500">
                            {cameraStarted && !cameraError ? 'Camera active' : 'Camera off'}
                        </span>
                    </div>
                </>
            ) : (
                /* Manual entry mode */
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full"
                >
                    <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
                        <div className="flex items-center gap-2 mb-3">
                            <Keyboard size={16} className="text-slate-500" />
                            <span className="text-sm font-bold text-slate-700">Enter Bag ID manually</span>
                        </div>
                        <form onSubmit={handleManualSubmit} className="flex gap-2">
                            <input
                                type="text"
                                value={manualInput}
                                onChange={(e) => setManualInput(e.target.value)}
                                placeholder="e.g. BAG-00042"
                                autoFocus
                                className="flex-1 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                            <button
                                type="submit"
                                disabled={!manualInput.trim()}
                                className="px-4 py-2.5 bg-slate-900 text-white text-xs font-black rounded-xl disabled:opacity-40 hover:bg-slate-700 transition-colors"
                            >
                                SCAN
                            </button>
                        </form>

                        {/* Scan result for manual */}
                        <AnimatePresence>
                            {scanResult && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    className={cn(
                                        'mt-3 rounded-xl p-3 flex items-center gap-2',
                                        scanResult.isValid
                                            ? 'bg-green-100 text-green-800'
                                            : 'bg-red-100 text-red-800'
                                    )}
                                >
                                    {scanResult.isValid ? (
                                        <CheckCircle2 size={16} />
                                    ) : (
                                        <AlertTriangle size={16} />
                                    )}
                                    <span className="text-xs font-bold">
                                        {scanResult.isValid
                                            ? `✅ ${scanResult.bagId}`
                                            : scanResult.error}
                                    </span>
                                    {!scanResult.isValid && (
                                        <button
                                            onClick={handleRetry}
                                            className="ml-auto text-xs font-black underline"
                                        >
                                            Retry
                                        </button>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <button
                            type="button"
                            onClick={() => setManualMode(false)}
                            className="mt-3 text-xs text-indigo-600 font-bold hover:underline"
                        >
                            ← Back to camera scan
                        </button>
                    </div>
                </motion.div>
            )}
        </div>
    );
};

export default QRScanner;
