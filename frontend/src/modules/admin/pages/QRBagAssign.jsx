import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Card from '@shared/components/ui/Card';
import PageHeader from '@shared/components/ui/PageHeader';
import { adminQRBagsApi } from '../services/api/qrBagsApi';
import { toast } from 'sonner';
import {
    Search, Package, Users, CheckCircle2, Loader2, X, ChevronRight, QrCode,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const QRBagAssign = () => {
    const [sellers, setSellers] = useState([]);
    const [availableBags, setAvailableBags] = useState([]);
    const [selectedSeller, setSelectedSeller] = useState(null);
    const [selectedBagIds, setSelectedBagIds] = useState([]);
    const [sellerSearch, setSellerSearch] = useState('');
    const [bagSearch, setBagSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [assigning, setAssigning] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [selRes, bagRes] = await Promise.all([
                adminQRBagsApi.getSellers(),
                adminQRBagsApi.getInventory({ status: 'AVAILABLE', limit: 200 }),
            ]);
            const selData = selRes.data?.result?.items;
            const bagData = bagRes.data?.result?.items;
            if (Array.isArray(selData)) setSellers(selData);
            if (Array.isArray(bagData)) setAvailableBags(bagData);
        } catch (err) {
            console.error("Failed to fetch assign data:", err);
            toast.error("Failed to load sellers or inventory");
        } finally { setLoading(false); }
    };
    useEffect(() => { fetchData(); }, []);

    const filteredSellers = sellers.filter(s => !sellerSearch || s.name.toLowerCase().includes(sellerSearch.toLowerCase()) || s.shopName?.toLowerCase().includes(sellerSearch.toLowerCase()));
    const filteredBags = availableBags.filter(b => !bagSearch || b.bagId.toLowerCase().includes(bagSearch.toLowerCase()));

    const toggleBag = (bagId) => setSelectedBagIds(prev => prev.includes(bagId) ? prev.filter(id => id !== bagId) : [...prev, bagId]);
    const selectAll = () => setSelectedBagIds(filteredBags.map(b => b.bagId));
    const clearAll = () => setSelectedBagIds([]);

    const handleAssign = async () => {
        if (!selectedSeller) { toast.error('Select a seller first'); return; }
        if (selectedBagIds.length === 0) { toast.error('Select at least one bag'); return; }
        setAssigning(true);
        try {
            await adminQRBagsApi.assignBagsToSeller({ sellerId: selectedSeller._id, bagIds: selectedBagIds });
            toast.success(`${selectedBagIds.length} bags assigned to ${selectedSeller.name}`);
            setAvailableBags(prev => prev.filter(b => !selectedBagIds.includes(b.bagId)));
            setSellers(prev => prev.map(s => s._id === selectedSeller._id ? { ...s, bagsAvailable: (s.bagsAvailable || 0) + selectedBagIds.length } : s));
            setSelectedBagIds([]);
            setSelectedSeller(null);
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Assignment failed');
        } finally { setAssigning(false); }
    };

    return (
        <div className="space-y-6 pb-16">
            <PageHeader title="Assign Bags to Sellers" description="Select bags from inventory and assign them to a seller." />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Seller selection */}
                <Card className="border-none shadow-sm ring-1 ring-slate-100">
                    <div className="p-4 border-b border-slate-100">
                        <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2"><Users size={13} />Select Seller</p>
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="text" value={sellerSearch} onChange={e => setSellerSearch(e.target.value)} placeholder="Search sellers…" className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                        </div>
                    </div>
                    <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
                        {loading ? <div className="flex justify-center py-10"><Loader2 size={24} className="text-indigo-500 animate-spin" /></div> :
                            filteredSellers.map(seller => (
                                <button key={seller._id} onClick={() => setSelectedSeller(seller)} className={cn('w-full text-left flex items-center justify-between rounded-2xl p-4 border transition-all', selectedSeller?._id === seller._id ? 'border-indigo-300 bg-indigo-50 ring-2 ring-indigo-200' : 'border-slate-100 bg-slate-50/60 hover:bg-slate-100/60')}>
                                    <div className="flex items-center gap-3">
                                        <div className="h-9 w-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                                            <span className="text-sm font-black text-indigo-700">{seller.name.charAt(0)}</span>
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-900">{seller.name}</p>
                                            <p className="text-xs font-medium text-slate-500">{seller.shopName || ''}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-black text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">{seller.bagsAvailable || 0} bags</span>
                                        {selectedSeller?._id === seller._id && <CheckCircle2 size={16} className="text-indigo-600" />}
                                    </div>
                                </button>
                            ))
                        }
                    </div>
                </Card>

                {/* Bag selection */}
                <Card className="border-none shadow-sm ring-1 ring-slate-100">
                    <div className="p-4 border-b border-slate-100">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><QrCode size={13} />Available Bags ({availableBags.length})</p>
                            <div className="flex gap-2">
                                <button onClick={selectAll} className="text-[10px] font-black text-indigo-600 hover:text-indigo-700">Select All</button>
                                <span className="text-slate-300">|</span>
                                <button onClick={clearAll} className="text-[10px] font-black text-slate-500 hover:text-slate-700">Clear</button>
                            </div>
                        </div>
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="text" value={bagSearch} onChange={e => setBagSearch(e.target.value)} placeholder="Search bag ID…" className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                        </div>
                    </div>
                    <div className="p-4 max-h-80 overflow-y-auto">
                        <div className="grid grid-cols-2 gap-2">
                            {filteredBags.map(bag => {
                                const isSelected = selectedBagIds.includes(bag.bagId);
                                return (
                                    <button key={bag._id} onClick={() => toggleBag(bag.bagId)} className={cn('flex items-center gap-2 p-3 rounded-xl border text-left transition-all', isSelected ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200' : 'border-slate-100 bg-slate-50/60 hover:bg-slate-100/60')}>
                                        <div className={cn('h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all', isSelected ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 bg-white')}>
                                            {isSelected && <CheckCircle2 size={12} className="text-white" />}
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-black text-slate-900 font-mono">{bag.bagId}</p>
                                            <p className="text-[10px] font-semibold text-slate-500">{bag.size}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </Card>
            </div>

            {/* Summary & Assign */}
            <AnimatePresence>
                {selectedBagIds.length > 0 && selectedSeller && (
                    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}>
                        <Card className="border-none shadow-lg ring-2 ring-indigo-200 p-5">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                <div className="flex-1">
                                    <p className="text-sm font-black text-slate-900">
                                        Assigning <span className="text-indigo-700">{selectedBagIds.length} bag{selectedBagIds.length !== 1 ? 's' : ''}</span> to <span className="text-indigo-700">{selectedSeller.name}</span>
                                    </p>
                                    <p className="text-xs font-medium text-slate-500 mt-0.5">This action will update bag status to ASSIGNED</p>
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={clearAll} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-black text-sm hover:bg-slate-200 transition-colors">CLEAR</button>
                                    <button onClick={handleAssign} disabled={assigning} className="bg-[#116A29] hover:bg-[#0e5621] text-white rounded-lg font-bold uppercase shadow-md transition-all flex items-center justify-center gap-2 px-5 py-2.5 active:scale-95 text-sm">
                                        {assigning ? <><Loader2 size={14} className="animate-spin" />ASSIGNING…</> : <>ASSIGN BAGS <ChevronRight size={14} /></>}
                                    </button>
                                </div>
                            </div>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default QRBagAssign;
