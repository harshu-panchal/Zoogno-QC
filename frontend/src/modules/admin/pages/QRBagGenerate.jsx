import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Card from '@shared/components/ui/Card';
import PageHeader from '@shared/components/ui/PageHeader';
import QRCodeDisplay from '@shared/components/ui/QRCodeDisplay';
import {
    generateTempBagId,
    generateBagQRBatch,
} from '@shared/utils/qrBagUtils';
import { adminQRBagsApi } from '../services/api/qrBagsApi';
import { toast } from 'sonner';
import {
    Package,
    Zap,
    Download,
    CheckCircle2,
    Loader2,
    LayoutGrid,
    SlidersHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const BAG_SIZES = ['Small', 'Medium', 'Large', 'XL'];

const QRBagGenerate = () => {
    const [quantity, setQuantity] = useState(10);
    const [size, setSize] = useState('Medium');
    const [notes, setNotes] = useState('');
    const [generating, setGenerating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [progress, setProgress] = useState(0);
    const [generatedBags, setGeneratedBags] = useState([]);
    const [saved, setSaved] = useState(false);

    const handleGenerate = useCallback(async () => {
        if (quantity < 1 || quantity > 500) {
            toast.error('Quantity must be between 1 and 500');
            return;
        }
        setGenerating(true);
        setProgress(0);
        setSaved(false);
        setGeneratedBags([]);

        try {
            const bagIds = Array.from({ length: quantity }, () => generateTempBagId());
            const results = await generateBagQRBatch(bagIds, (done, total) => {
                setProgress(Math.round((done / total) * 100));
            });
            setGeneratedBags(results);
        } catch {
            toast.error('Failed to generate QR codes');
        } finally {
            setGenerating(false);
            setProgress(100);
        }
    }, [quantity]);

    const handleSaveToInventory = async () => {
        setSaving(true);
        try {
            await adminQRBagsApi.generateBags({ quantity, size, notes });
            setSaved(true);
            toast.success(`${quantity} bags saved to inventory!`);
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to save bags to inventory');
        } finally {
            setSaving(false);
        }
    };

    const handleDownloadAll = () => {
        generatedBags.forEach(({ bagId, dataUrl }) => {
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `${bagId}.png`;
            a.click();
        });
        toast.success(`Downloading ${generatedBags.length} QR images…`);
    };

    return (
        <div className="space-y-6 pb-16">
            <PageHeader
                title="Generate QR Bags"
                description="Create QR-coded paper bags in bulk for seller distribution."
            />

            {/* Config Form */}
            <Card className="border-none shadow-sm ring-1 ring-slate-100">
                <div className="p-4">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-5 flex items-center gap-2">
                        <SlidersHorizontal size={15} className="text-indigo-500" />
                        Configuration
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">Quantity</label>
                            <input
                                type="number"
                                min={1}
                                max={500}
                                value={quantity}
                                onChange={(e) => setQuantity(Math.max(1, Math.min(500, Number(e.target.value))))}
                                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                            <p className="text-xs text-slate-400 font-medium mt-1">Max 500 per batch</p>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">Bag Size</label>
                            <div className="grid grid-cols-2 gap-2">
                                {BAG_SIZES.map((s) => (
                                    <button
                                        key={s}
                                        type="button"
                                        onClick={() => setSize(s)}
                                        className={cn(
                                            'py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border transition-all',
                                            size === s
                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                                        )}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">Batch Notes</label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Optional notes for this batch…"
                                rows={3}
                                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 mt-6">
                        <button
                            onClick={handleGenerate}
                            disabled={generating}
                            className="bg-[#116A29] hover:bg-[#0e5621] text-white rounded-lg font-bold uppercase shadow-md transition-all flex items-center justify-center gap-2 px-5 py-2.5 active:scale-95 text-sm"
                        >
                            {generating ? <><Loader2 size={15} className="animate-spin" />GENERATING…</> : <><Zap size={15} />GENERATE {quantity} BAGS</>}
                        </button>

                        {generatedBags.length > 0 && !saved && (
                            <>
                                <button
                                    onClick={handleDownloadAll}
                                    className="bg-[#116A29] hover:bg-[#0e5621] text-white rounded-lg font-bold uppercase shadow-md transition-all flex items-center justify-center gap-2 px-5 py-2.5 active:scale-95 text-sm"
                                >
                                    <Download size={15} />DOWNLOAD ALL
                                </button>
                                <button
                                    onClick={handleSaveToInventory}
                                    disabled={saving}
                                    className="bg-[#116A29] hover:bg-[#0e5621] text-white rounded-lg font-bold uppercase shadow-md transition-all flex items-center justify-center gap-2 px-5 py-2.5 active:scale-95 text-sm"
                                >
                                    {saving ? <><Loader2 size={15} className="animate-spin" />SAVING…</> : <><CheckCircle2 size={15} />SAVE TO INVENTORY</>}
                                </button>
                            </>
                        )}
                    </div>

                    {/* Progress bar */}
                    {generating && (
                        <div className="mt-5">
                            <div className="flex justify-between text-xs font-bold text-slate-500 mb-1.5">
                                <span>Generating QR codes…</span>
                                <span>{progress}%</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-indigo-500 rounded-full"
                                    animate={{ width: `${progress}%` }}
                                    transition={{ ease: 'easeOut', duration: 0.3 }}
                                />
                            </div>
                        </div>
                    )}

                    {saved && (
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-4 flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3"
                        >
                            <CheckCircle2 size={16} />
                            <span className="text-sm font-bold">{quantity} bags saved to inventory successfully!</span>
                        </motion.div>
                    )}
                </div>
            </Card>

            {/* Preview grid */}
            <AnimatePresence>
                {generatedBags.length > 0 && (
                    <Card className="border-none shadow-sm ring-1 ring-slate-100">
                        <div className="p-4">
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                    <LayoutGrid size={15} className="text-indigo-500" />
                                    Preview — {generatedBags.length} QR Bags Generated
                                </h3>
                                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">{size} size</span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                                {generatedBags.map(({ bagId }, i) => (
                                    <motion.div
                                        key={bagId}
                                        initial={{ opacity: 0, scale: 0.85 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: Math.min(i * 0.03, 1) }}
                                        className="flex flex-col items-center"
                                    >
                                        <QRCodeDisplay bagId={bagId} size={100} showActions={false} />
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    </Card>
                )}
            </AnimatePresence>
        </div>
    );
};

export default QRBagGenerate;
