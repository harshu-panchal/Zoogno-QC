import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Card from '@shared/components/ui/Card';
import PageHeader from '@shared/components/ui/PageHeader';
import QRScanner from '@shared/components/ui/QRScanner';
import { adminQRBagsApi } from '../services/api/qrBagsApi';
import { getBagStatusConfig } from '@shared/utils/qrBagUtils';
import { toast } from 'sonner';
import {
    ScanLine, CheckCircle2, XCircle, Loader2, Package, History, Zap, Wifi,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const QRHubScan = () => {
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scanLog, setScanLog] = useState([]);
    const [scanning, setScanning] = useState(false);

    const handleScan = async (bagId) => {
        setScanning(true);
        try {
            const res = await adminQRBagsApi.hubScanBag({ bagId });
            const bag = res.data?.result?.bag;
            const entry = {
                id: Date.now(),
                bagId,
                time: new Date().toISOString(),
                success: true,
                orderId: bag?.orderId,
                seller: bag?.seller?.name,
                status: bag?.status || 'HUB_SCANNED',
            };
            setScanLog(prev => [entry, ...prev].slice(0, 50));
            toast.success(`Bag ${bagId} scanned at hub ✅`);
        } catch (err) {
            const msg = err?.response?.data?.message || 'Scan failed';
            const isDuplicate = err?.response?.status === 409;
            const entry = {
                id: Date.now(),
                bagId,
                time: new Date().toISOString(),
                success: false,
                error: msg,
                isDuplicate,
            };
            setScanLog(prev => [entry, ...prev].slice(0, 50));
            if (isDuplicate) {
                toast.error(`⚠️ Duplicate scan — Bag ${bagId} already scanned at hub!`);
            } else {
                toast.error(msg);
            }
        } finally {
            setScanning(false);
        }
    };

    const handleDuplicate = (bagId) => {
        toast.error(`⚠️ Bag ${bagId} already scanned!`);
    };

    const successCount = scanLog.filter(s => s.success).length;
    const errorCount = scanLog.filter(s => !s.success).length;

    return (
        <div className="space-y-6 pb-16">
            <PageHeader title="Hub Scan" description="Scan QR bags arriving at the distribution hub." />

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                    { label: 'Total Scans', value: scanLog.length, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                    { label: 'Successful', value: successCount, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: 'Errors', value: errorCount, color: 'text-red-600', bg: 'bg-red-50' },
                    { label: 'Success Rate', value: scanLog.length > 0 ? `${Math.round((successCount / scanLog.length) * 100)}%` : '—', color: 'text-amber-600', bg: 'bg-amber-50' },
                ].map(s => (
                    <Card key={s.label} className="border-none shadow-sm ring-1 ring-slate-100 p-4">
                        <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center mb-2', s.bg)}>
                            <CheckCircle2 size={18} className={s.color} />
                        </div>
                        <p className="text-xl font-black text-slate-900">{s.value}</p>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-0.5">{s.label}</p>
                    </Card>
                ))}
            </div>

            {/* Scanner */}
            <Card className="border-none shadow-sm ring-1 ring-slate-100">
                <div className="p-4">
                    <div className="flex items-center justify-between mb-5">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                            <Wifi size={15} className="text-indigo-500" />
                            QR Scanner
                        </h3>
                        {scanning && (
                            <div className="flex items-center gap-2 text-xs font-bold text-indigo-600">
                                <Loader2 size={13} className="animate-spin" />
                                Processing…
                            </div>
                        )}
                    </div>

                    {!scannerOpen ? (
                        <div className="flex flex-col items-center py-10 gap-5">
                            <div className="h-20 w-20 rounded-3xl bg-indigo-50 flex items-center justify-center">
                                <ScanLine size={36} className="text-indigo-400" />
                            </div>
                            <button
                                onClick={() => setScannerOpen(true)}
                                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-black text-sm transition-colors"
                            >
                                <Zap size={15} />
                                START SCANNING
                            </button>
                            <p className="text-xs text-slate-400 font-medium text-center max-w-xs">
                                Scan each bag's QR code as it arrives at the hub. Duplicate scans will be flagged automatically.
                            </p>
                        </div>
                    ) : (
                        <div>
                            <QRScanner
                                title="Hub Scan"
                                hint="Point camera at the bag QR code"
                                onScan={handleScan}
                                onDuplicate={handleDuplicate}
                                onClose={() => setScannerOpen(false)}
                                allowManual
                            />
                        </div>
                    )}
                </div>
            </Card>

            {/* Scan log */}
            {scanLog.length > 0 && (
                <Card className="border-none shadow-sm ring-1 ring-slate-100">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <History size={13} />
                            Scan Log ({scanLog.length})
                        </h3>
                        <button onClick={() => setScanLog([])} className="text-xs font-black text-slate-400 hover:text-red-500">CLEAR</button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left min-w-[480px]">
                            <thead>
                                <tr className="bg-slate-50/60 border-b border-slate-100">
                                    {['Bag ID', 'Status', 'Seller', 'Order', 'Time'].map(h => (
                                        <th key={h} className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                <AnimatePresence mode="popLayout">
                                    {scanLog.map(entry => (
                                        <motion.tr key={entry.id} layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className={cn('hover:bg-slate-50/60', !entry.success && 'bg-red-50/30')}>
                                            <td className="px-4 py-2.5 font-black text-xs text-slate-900 font-mono">{entry.bagId}</td>
                                            <td className="px-4 py-2.5">
                                                {entry.success
                                                    ? <span className="flex items-center gap-1.5 text-emerald-700 text-[10px] font-black"><CheckCircle2 size={12} />{entry.status || 'SCANNED'}</span>
                                                    : <span className="flex items-center gap-1.5 text-red-700 text-[10px] font-black"><XCircle size={12} />{entry.isDuplicate ? 'DUPLICATE' : 'ERROR'}</span>
                                                }
                                            </td>
                                            <td className="px-4 py-2.5 text-xs font-semibold text-slate-600">{entry.seller || '—'}</td>
                                            <td className="px-4 py-2.5 text-xs font-semibold text-indigo-600">{entry.orderId || '—'}</td>
                                            <td className="px-4 py-2.5 text-xs font-medium text-slate-500">{new Date(entry.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                                        </motion.tr>
                                    ))}
                                </AnimatePresence>
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    );
};

export default QRHubScan;
