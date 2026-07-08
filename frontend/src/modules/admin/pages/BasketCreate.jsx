import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';
import Card from '@shared/components/ui/Card';
import PageHeader from '@shared/components/ui/PageHeader';
import { BASKET_SIZES } from '@shared/utils/basketUtils';
import { adminBasketsApi } from '../services/api/basketApi';
import { toast } from 'sonner';
import {
    ShoppingBasket, Plus, CheckCircle2, Loader2, Package,
    Sparkles, ChevronRight, AlertTriangle, QrCode, IndianRupee, Download
} from 'lucide-react';
import { adminSettingsApi } from '../services/api/settingsApi';
import { cn } from '@/lib/utils';
import { generateBagQRBatch } from '@shared/utils/qrBagUtils';

const BasketCreate = () => {
    const [quantity, setQuantity] = useState(10);
    const [selectedSize, setSelectedSize] = useState('');
    const [notes, setNotes] = useState('');
    const [creating, setCreating] = useState(false);
    const [created, setCreated] = useState(null);
    const [qrCodes, setQrCodes] = useState({});
    const [generatingQRs, setGeneratingQRs] = useState(false);

    const [pricing, setPricing] = useState({ small: 0, medium: 0, large: 0 });
    const [savingPricing, setSavingPricing] = useState(false);

    useEffect(() => {
        const fetchPricing = async () => {
            try {
                const res = await adminSettingsApi.getSettings();
                const settings = res.data?.result || res.data?.data;
                if (settings?.basketPricing) {
                    setPricing(settings.basketPricing);
                }
            } catch (error) {
                console.error("Failed to load pricing", error);
            }
        };
        fetchPricing();
    }, []);

    const handleSavePricing = async () => {
        setSavingPricing(true);
        try {
            await adminSettingsApi.updateSettings({ basketPricing: pricing });
            toast.success("Basket pricing updated successfully!");
        } catch (error) {
            toast.error("Failed to update pricing");
        } finally {
            setSavingPricing(false);
        }
    };

    const handleCreate = async () => {
        if (!selectedSize) { toast.error('Select a basket size'); return; }
        if (quantity < 1 || quantity > 100) { toast.error('Quantity must be between 1 and 100'); return; }

        setCreating(true);
        try {
            const res = await adminBasketsApi.createBaskets({
                quantity,
                size: selectedSize,
                notes: notes || undefined,
            });
            const result = res.data?.result;
            setCreated(result);
            toast.success(`${quantity} basket${quantity > 1 ? 's' : ''} created successfully!`);
            
            // Generate QR codes
            if (result?.basketIds?.length > 0) {
                setGeneratingQRs(true);
                try {
                    const generatedQrs = await generateBagQRBatch(result.basketIds);
                    const qrMap = {};
                    generatedQrs.forEach(({ bagId, dataUrl }) => {
                        qrMap[bagId] = dataUrl;
                    });
                    setQrCodes(qrMap);
                } catch (qrErr) {
                    toast.error('Failed to generate some QR codes');
                } finally {
                    setGeneratingQRs(false);
                }
            }
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to create baskets');
        } finally {
            setCreating(false);
        }
    };

    const handleReset = () => {
        setCreated(null);
        setQuantity(10);
        setSelectedSize('');
        setNotes('');
        setQrCodes({});
    };

    const handleDownloadAll = () => {
        if (!created?.basketIds || created.basketIds.length === 0) return;
        
        toast.success(`Generating PDF for ${created.basketIds.length} baskets…`);
        const pdf = new jsPDF('p', 'mm', 'a4');
        const cols = 3;
        const rows = 5;
        const qrSize = 40;
        const marginX = 20;
        const marginY = 20;
        const gapX = (210 - 2 * marginX - cols * qrSize) / (cols - 1);
        const gapY = (297 - 2 * marginY - rows * (qrSize + 10)) / (rows - 1);

        created.basketIds.forEach((id, index) => {
            if (index > 0 && index % (cols * rows) === 0) {
                pdf.addPage();
            }

            const pageIndex = index % (cols * rows);
            const col = pageIndex % cols;
            const row = Math.floor(pageIndex / cols);

            const x = marginX + col * (qrSize + gapX);
            const y = marginY + row * (qrSize + gapY + 10);

            if (qrCodes[id]) {
                pdf.addImage(qrCodes[id], 'PNG', x, y, qrSize, qrSize);
            }
            
            pdf.setFontSize(9);
            pdf.setFont("helvetica", "bold");
            pdf.text(id, x + (qrSize / 2), y + qrSize + 5, { align: 'center' });
        });

        pdf.save(`zoognu-baskets-${created.basketIds.length}-${Date.now()}.pdf`);
    };

    const handleDownloadIndividual = (id) => {
        if (!qrCodes[id]) return;
        const link = document.createElement('a');
        link.href = qrCodes[id];
        link.download = `basket-${id}.png`;
        link.click();
    };

    return (
        <div className="space-y-6 pb-16">
            <PageHeader
                title="Create Baskets"
                description="Add new reusable baskets to your inventory for bulky order fulfillment."
            />

            {/* Pricing Config Form */}
            <Card className="border-none shadow-sm ring-1 ring-slate-100">
                <div className="p-4">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-5 flex items-center gap-2">
                        <IndianRupee size={15} className="text-emerald-500" />
                        Basket Pricing Configuration
                    </h3>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {Object.keys(pricing).map((pSize) => (
                            <div key={pSize}>
                                <label className="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">{pSize} Price (₹)</label>
                                <input
                                    type="number"
                                    min={0}
                                    value={pricing[pSize]}
                                    onChange={(e) => setPricing(prev => ({ ...prev, [pSize]: Number(e.target.value) }))}
                                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                                />
                            </div>
                        ))}
                    </div>

                    <div className="flex mt-6">
                        <button
                            onClick={handleSavePricing}
                            disabled={savingPricing}
                            className="bg-[#116A29] hover:bg-[#0e5621] text-white rounded-lg font-bold uppercase shadow-md transition-all flex items-center justify-center gap-2 px-5 py-2.5 active:scale-95 text-sm"
                        >
                            {savingPricing ? <><Loader2 size={15} className="animate-spin" />SAVING…</> : <><CheckCircle2 size={15} />SAVE PRICING</>}
                        </button>
                    </div>
                </div>
            </Card>

            {/* Success State */}
            <AnimatePresence mode="wait">
                {created ? (
                    <motion.div
                        key="success"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                    >
                        <Card className="border-none shadow-sm ring-1 ring-slate-100 p-5 text-center">
                            <motion.div
                                initial={{ scale: 0.5, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: 'spring', bounce: 0.5 }}
                                className="h-16 w-16 rounded-3xl bg-emerald-500 flex items-center justify-center mx-auto mb-4"
                            >
                                <CheckCircle2 size={30} className="text-white" />
                            </motion.div>
                            <h3 className="text-xl font-black text-slate-900 mb-1">Baskets Created! 🎉</h3>
                            <p className="text-sm font-medium text-slate-500 mb-6">
                                <span className="font-black text-slate-800">{created?.count || quantity}</span> {selectedSize.toLowerCase()} baskets have been added to inventory
                            </p>

                            {/* Created basket IDs */}
                            {created?.basketIds && (
                                <div className="bg-slate-50 rounded-2xl p-5 mb-6 text-left">
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Created Basket IDs</p>
                                        {generatingQRs && <Loader2 size={14} className="text-indigo-400 animate-spin" />}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                                        {created.basketIds.map((id) => (
                                            <div key={id} className="flex items-center gap-3 bg-white rounded-xl p-3 border border-slate-100 shadow-sm hover:border-indigo-100 hover:shadow-md transition-all group">
                                                <div className="h-10 w-10 rounded-lg border border-slate-100 flex items-center justify-center bg-slate-50 shrink-0 overflow-hidden">
                                                    {qrCodes[id] ? (
                                                        <img src={qrCodes[id]} alt={`QR for ${id}`} className="w-full h-full object-cover p-0.5" />
                                                    ) : (
                                                        <QrCode size={18} className="text-slate-300" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-black text-slate-900 font-mono truncate">{id}</p>
                                                    <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1 mt-0.5">
                                                        <ShoppingBasket size={10} className="text-indigo-500" />
                                                        {selectedSize}
                                                    </p>
                                                </div>
                                                {qrCodes[id] && (
                                                    <button 
                                                        onClick={() => handleDownloadIndividual(id)}
                                                        className="h-8 w-8 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 flex items-center justify-center shrink-0 transition-colors opacity-0 group-hover:opacity-100"
                                                        title="Download QR"
                                                    >
                                                        <Download size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-col sm:flex-row gap-3 mt-6">
                                <button onClick={handleDownloadAll} disabled={generatingQRs || !qrCodes || Object.keys(qrCodes).length === 0} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold uppercase shadow-md transition-all flex items-center justify-center gap-2 px-5 py-2.5 active:scale-95 text-sm disabled:opacity-50">
                                    <Download size={15} /> DOWNLOAD ALL QR CODES
                                </button>
                                <button onClick={handleReset} className="flex-1 bg-[#116A29] hover:bg-[#0e5621] text-white rounded-lg font-bold uppercase shadow-md transition-all flex items-center justify-center gap-2 px-5 py-2.5 active:scale-95 text-sm">
                                    CREATE MORE BASKETS
                                </button>
                            </div>
                        </Card>
                    </motion.div>
                ) : (
                    <motion.div
                        key="form"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="grid grid-cols-1 lg:grid-cols-3 gap-4"
                    >
                        {/* Size Selection */}
                        <div className="lg:col-span-2 space-y-6">
                            <Card className="border-none shadow-sm ring-1 ring-slate-100">
                                <div className="p-4 border-b border-slate-100">
                                    <p className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                        <ShoppingBasket size={13} />Select Basket Size
                                    </p>
                                </div>
                                <div className="p-4 space-y-3">
                                    {BASKET_SIZES.map((size) => (
                                        <button
                                            key={size.value}
                                            onClick={() => setSelectedSize(size.value)}
                                            className={cn(
                                                'w-full text-left flex items-center gap-4 rounded-2xl p-5 border transition-all',
                                                selectedSize === size.value
                                                    ? 'border-[#116A29] bg-[#116A29] text-white shadow-md'
                                                    : 'border-slate-100 bg-slate-50/60 hover:bg-slate-100/60 text-slate-900'
                                            )}
                                        >
                                            <div className={cn(
                                                'h-10 w-10 rounded-xl flex items-center justify-center text-2xl shrink-0 transition-colors',
                                                selectedSize === size.value ? 'bg-white shadow-sm' : 'bg-slate-100'
                                            )}>
                                                {size.icon}
                                            </div>
                                            <div className="flex-1">
                                                <p className={cn("text-sm font-black", selectedSize === size.value ? 'text-white' : 'text-slate-900')}>{size.label}</p>
                                                <p className={cn("text-xs font-medium mt-0.5", selectedSize === size.value ? 'text-white/80' : 'text-slate-500')}>{size.description}</p>
                                            </div>
                                            {selectedSize === size.value && (
                                                <CheckCircle2 size={20} className="text-white shrink-0" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </Card>

                            <Card className="border-none shadow-sm ring-1 ring-slate-100">
                                <div className="p-4 border-b border-slate-100">
                                    <p className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                        <Sparkles size={13} />Quantity & Notes
                                    </p>
                                </div>
                                <div className="p-4 space-y-4">
                                    <div>
                                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 block">
                                            Number of Baskets
                                        </label>
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                                className="h-10 w-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 font-black transition-colors"
                                            >
                                                −
                                            </button>
                                            <input
                                                type="number"
                                                value={quantity}
                                                onChange={(e) => setQuantity(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                                                className="w-20 text-center py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                                min={1}
                                                max={100}
                                            />
                                            <button
                                                onClick={() => setQuantity(Math.min(100, quantity + 1))}
                                                className="h-10 w-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 font-black transition-colors"
                                            >
                                                +
                                            </button>
                                            <div className="flex gap-2 ml-2">
                                                {[5, 10, 25, 50].map((v) => (
                                                    <button
                                                        key={v}
                                                        onClick={() => setQuantity(v)}
                                                        className={cn(
                                                            'px-3 py-1.5 rounded-lg text-[10px] font-black transition-all',
                                                            quantity === v ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                        )}
                                                    >
                                                        {v}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        {(quantity < 1 || quantity > 100) && (
                                            <p className="text-xs text-red-500 font-bold mt-1 flex items-center gap-1">
                                                <AlertTriangle size={11} /> Must be between 1 and 100
                                            </p>
                                        )}
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 block">
                                            Notes (Optional)
                                        </label>
                                        <textarea
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                            placeholder="Any notes about this batch…"
                                            rows={3}
                                            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                                        />
                                    </div>
                                </div>
                            </Card>
                        </div>

                        {/* Preview Panel */}
                        <div className="lg:col-span-1">
                            <Card className="border-none shadow-sm ring-1 ring-slate-100 sticky top-4">
                                <div className="p-4 border-b border-slate-100">
                                    <p className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                        <ShoppingBasket size={13} />Preview
                                    </p>
                                </div>
                                <div className="p-5 space-y-4">
                                    <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl p-4 text-center">
                                        <div className="h-16 w-16 rounded-2xl bg-white/80 flex items-center justify-center mx-auto mb-3 shadow-sm">
                                            <ShoppingBasket size={28} className="text-indigo-600" />
                                        </div>
                                        <p className="text-3xl font-black text-indigo-700">{quantity}</p>
                                        <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider mt-1">
                                            {selectedSize ? BASKET_SIZES.find(s => s.value === selectedSize)?.label : 'No Size Selected'}
                                        </p>
                                    </div>

                                    <div className="space-y-2 text-xs">
                                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                                            <span className="font-bold text-slate-500 uppercase">Size</span>
                                            <span className="font-black text-slate-900">
                                                {selectedSize ? BASKET_SIZES.find(s => s.value === selectedSize)?.label : '—'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                                            <span className="font-bold text-slate-500 uppercase">Quantity</span>
                                            <span className="font-black text-slate-900">{quantity}</span>
                                        </div>
                                        {notes && (
                                            <div className="flex justify-between items-start py-2 border-b border-slate-50">
                                                <span className="font-bold text-slate-500 uppercase shrink-0">Notes</span>
                                                <span className="font-semibold text-slate-700 text-right ml-3 line-clamp-2">{notes}</span>
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={handleCreate}
                                        disabled={creating || !selectedSize || quantity < 1 || quantity > 100}
                                        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-black py-3.5 text-sm transition-colors"
                                    >
                                        {creating ? (
                                            <><Loader2 size={15} className="animate-spin" />CREATING…</>
                                        ) : (
                                            <><Plus size={15} />CREATE {quantity} BASKET{quantity > 1 ? 'S' : ''}</>
                                        )}
                                    </button>
                                </div>
                            </Card>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default BasketCreate;
