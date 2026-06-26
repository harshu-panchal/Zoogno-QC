import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, QrCode, Clock, Box, RefreshCw } from 'lucide-react';
import { getBasketStatusConfig } from '@shared/utils/basketUtils';
import { generateBagQRDataURL } from '@shared/utils/qrBagUtils';

const BasketHistoryModal = ({ basket, onClose }) => {
    const [qrUrl, setQrUrl] = useState(null);

    useEffect(() => {
        if (basket?.basketId) {
            generateBagQRDataURL(basket.basketId)
                .then(setQrUrl)
                .catch(() => setQrUrl(null));
        }
    }, [basket]);

    if (!basket) return null;

    const timeline = basket.timeline || [];
    const usageHistory = basket.usageHistory || [];
    const reuseCount = basket.reuseCount || 0;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
                <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="relative z-10 bg-white rounded-3xl p-6 shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-hide">
                    <div className="flex items-center justify-between mb-5 sticky top-0 bg-white/80 backdrop-blur-md pb-2 border-b border-slate-100 z-10">
                        <div className="flex items-center gap-3">
                            <div className="bg-indigo-100 text-indigo-600 p-2 rounded-lg">
                                <Box size={18} />
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Basket: {basket.basketId}</h3>
                                <p className="text-[10px] font-bold text-slate-500 uppercase">Reuse Count: {reuseCount}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500"><X size={16} /></button>
                    </div>

                    <div className="flex justify-center mb-6">
                        <div className="h-32 w-32 rounded-2xl bg-indigo-50 border-2 border-indigo-100 flex items-center justify-center p-2 overflow-hidden shadow-sm">
                            {qrUrl ? (
                                <img src={qrUrl} alt={`QR`} className="w-full h-full object-contain" />
                            ) : (
                                <QrCode size={40} className="text-indigo-400" />
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs mb-6">
                        {[
                            { label: 'Status', value: getBasketStatusConfig(basket.status).label },
                            { label: 'Size', value: basket.size || '—' },
                            { label: 'Seller', value: basket.seller?.name || 'Unassigned' },
                            { label: 'Order', value: basket.orderId || '—' },
                            { label: 'Created', value: new Date(basket.createdAt).toLocaleDateString('en-IN') },
                            { label: 'Last Scan', value: basket.lastScan ? new Date(basket.lastScan).toLocaleString('en-IN') : 'Never' },
                        ].map(({ label, value }) => (
                            <div key={label} className="bg-slate-50 rounded-xl p-3">
                                <p className="text-slate-500 font-bold uppercase tracking-wider mb-1">{label}</p>
                                <p className="font-black text-slate-900">{value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Usage History */}
                    {usageHistory.length > 0 && (
                        <div className="mb-6">
                            <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><RefreshCw size={12} /> Usage History ({usageHistory.length})</h4>
                            <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-100 max-h-48 overflow-y-auto">
                                {usageHistory.map((usage, i) => (
                                    <div key={i} className="flex items-center justify-between text-xs bg-white p-2 rounded-lg border border-slate-100 shadow-sm">
                                        <span className="font-bold text-slate-700">Order: {usage.orderId || "Unknown"}</span>
                                        <span className="text-[10px] text-slate-500 font-medium">{new Date(usage.usedAt).toLocaleString('en-IN')}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Full Timeline */}
                    {timeline.length > 0 && (
                        <div>
                            <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Clock size={12} /> Full Timeline</h4>
                            <div className="space-y-4 pl-2">
                                {timeline.map((event, i) => (
                                    <div key={i} className="relative pl-4 border-l-2 border-indigo-100 pb-1 last:border-0 last:pb-0">
                                        <div className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-indigo-500 shadow-[0_0_0_3px_#e0e7ff]" />
                                        <div>
                                            <p className="text-xs font-black text-slate-800 uppercase">{event.status}</p>
                                            <p className="text-[10px] text-slate-500 mt-0.5">{new Date(event.timestamp).toLocaleString('en-IN')} — {event.actorModel}</p>
                                            {event.notes && <p className="text-xs text-slate-600 mt-1.5 bg-slate-50 p-2 rounded-lg border border-slate-100">{event.notes}</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default BasketHistoryModal;
