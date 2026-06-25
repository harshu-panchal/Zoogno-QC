import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Card from '@shared/components/ui/Card';
import PageHeader from '@shared/components/ui/PageHeader';
import { adminBasketsApi } from '../services/api/basketApi';
import { toast } from 'sonner';
import {
    Search, ShoppingBasket, Users, CheckCircle2, Loader2, X,
    ChevronRight, Package,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const BasketAssign = () => {
    const [sellers, setSellers] = useState([]);
    const [availableBaskets, setAvailableBaskets] = useState([]);
    const [selectedSeller, setSelectedSeller] = useState(null);
    const [selectedBasketIds, setSelectedBasketIds] = useState([]);
    const [sellerSearch, setSellerSearch] = useState('');
    const [basketSearch, setBasketSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [assigning, setAssigning] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [selRes, basketRes] = await Promise.all([
                adminBasketsApi.getSellers(),
                adminBasketsApi.getInventory({ status: 'AVAILABLE', limit: 200 }),
            ]);
            const selData = selRes.data?.result?.items;
            const basketData = basketRes.data?.result?.items;
            if (Array.isArray(selData)) setSellers(selData);
            if (Array.isArray(basketData)) setAvailableBaskets(basketData);
        } catch (err) {
            console.error("Failed to fetch assign data:", err);
            toast.error("Failed to load sellers or basket inventory");
        } finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);

    const filteredSellers = sellers.filter(s =>
        !sellerSearch ||
        s.name.toLowerCase().includes(sellerSearch.toLowerCase()) ||
        s.shopName?.toLowerCase().includes(sellerSearch.toLowerCase())
    );

    const filteredBaskets = availableBaskets.filter(b =>
        !basketSearch || b.basketId.toLowerCase().includes(basketSearch.toLowerCase())
    );

    const toggleBasket = (basketId) =>
        setSelectedBasketIds(prev =>
            prev.includes(basketId) ? prev.filter(id => id !== basketId) : [...prev, basketId]
        );

    const selectAll = () => setSelectedBasketIds(filteredBaskets.map(b => b.basketId));
    const clearAll = () => setSelectedBasketIds([]);

    const handleAssign = async () => {
        if (!selectedSeller) { toast.error('Select a seller first'); return; }
        if (selectedBasketIds.length === 0) { toast.error('Select at least one basket'); return; }
        setAssigning(true);
        try {
            await adminBasketsApi.assignToSeller({ sellerId: selectedSeller._id, basketIds: selectedBasketIds });
            toast.success(`${selectedBasketIds.length} basket${selectedBasketIds.length > 1 ? 's' : ''} assigned to ${selectedSeller.name}`);
            setAvailableBaskets(prev => prev.filter(b => !selectedBasketIds.includes(b.basketId)));
            setSellers(prev => prev.map(s =>
                s._id === selectedSeller._id
                    ? { ...s, basketsAvailable: (s.basketsAvailable || 0) + selectedBasketIds.length }
                    : s
            ));
            setSelectedBasketIds([]);
            setSelectedSeller(null);
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Assignment failed');
        } finally { setAssigning(false); }
    };

    return (
        <div className="space-y-6 pb-16">
            <PageHeader
                title="Assign Baskets to Sellers"
                description="Select baskets from inventory and assign them to a seller for bulky order fulfillment."
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Seller selection */}
                <Card className="border-none shadow-sm ring-1 ring-slate-100">
                    <div className="p-4 border-b border-slate-100">
                        <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <Users size={13} />Select Seller
                        </p>
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={sellerSearch}
                                onChange={e => setSellerSearch(e.target.value)}
                                placeholder="Search sellers…"
                                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                        </div>
                    </div>
                    <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
                        {loading ? (
                            <div className="flex justify-center py-10">
                                <Loader2 size={24} className="text-indigo-500 animate-spin" />
                            </div>
                        ) : filteredSellers.length === 0 ? (
                            <div className="text-center py-10 text-slate-400">
                                <Users size={28} className="mx-auto mb-2" />
                                <p className="text-sm font-bold">No sellers found</p>
                            </div>
                        ) : (
                            filteredSellers.map(seller => (
                                <button
                                    key={seller._id}
                                    onClick={() => setSelectedSeller(seller)}
                                    className={cn(
                                        'w-full text-left flex items-center justify-between rounded-2xl p-4 border transition-all',
                                        selectedSeller?._id === seller._id
                                            ? 'border-indigo-300 bg-indigo-50 ring-2 ring-indigo-200'
                                            : 'border-slate-100 bg-slate-50/60 hover:bg-slate-100/60'
                                    )}
                                >
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
                                        <span className="text-xs font-black text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">
                                            {seller.basketsAvailable || 0} baskets
                                        </span>
                                        {selectedSeller?._id === seller._id && <CheckCircle2 size={16} className="text-indigo-600" />}
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </Card>

                {/* Basket selection */}
                <Card className="border-none shadow-sm ring-1 ring-slate-100">
                    <div className="p-4 border-b border-slate-100">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <ShoppingBasket size={13} />Available Baskets ({availableBaskets.length})
                            </p>
                            <div className="flex gap-2">
                                <button onClick={selectAll} className="text-[10px] font-black text-indigo-600 hover:text-indigo-700">Select All</button>
                                <span className="text-slate-300">|</span>
                                <button onClick={clearAll} className="text-[10px] font-black text-slate-500 hover:text-slate-700">Clear</button>
                            </div>
                        </div>
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={basketSearch}
                                onChange={e => setBasketSearch(e.target.value)}
                                placeholder="Search basket ID…"
                                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                        </div>
                    </div>
                    <div className="p-4 max-h-80 overflow-y-auto">
                        {loading ? (
                            <div className="flex justify-center py-10">
                                <Loader2 size={24} className="text-indigo-500 animate-spin" />
                            </div>
                        ) : filteredBaskets.length === 0 ? (
                            <div className="text-center py-10 text-slate-400">
                                <Package size={28} className="mx-auto mb-2" />
                                <p className="text-sm font-bold">No available baskets</p>
                                <p className="text-xs mt-1">Create baskets first</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                {filteredBaskets.map(basket => {
                                    const isSelected = selectedBasketIds.includes(basket.basketId);
                                    return (
                                        <button
                                            key={basket._id}
                                            onClick={() => toggleBasket(basket.basketId)}
                                            className={cn(
                                                'flex items-center gap-2 p-3 rounded-xl border text-left transition-all',
                                                isSelected
                                                    ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200'
                                                    : 'border-slate-100 bg-slate-50/60 hover:bg-slate-100/60'
                                            )}
                                        >
                                            <div className={cn(
                                                'h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all',
                                                isSelected ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 bg-white'
                                            )}>
                                                {isSelected && <CheckCircle2 size={12} className="text-white" />}
                                            </div>
                                            <div>
                                                <p className="text-[11px] font-black text-slate-900 font-mono">{basket.basketId}</p>
                                                <p className="text-[10px] font-semibold text-slate-500">{basket.size}</p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </Card>
            </div>

            {/* Summary & Assign */}
            <AnimatePresence>
                {selectedBasketIds.length > 0 && selectedSeller && (
                    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}>
                        <Card className="border-none shadow-lg ring-2 ring-indigo-200 p-5">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                <div className="flex-1">
                                    <p className="text-sm font-black text-slate-900">
                                        Assigning <span className="text-indigo-700">{selectedBasketIds.length} basket{selectedBasketIds.length !== 1 ? 's' : ''}</span> to <span className="text-indigo-700">{selectedSeller.name}</span>
                                    </p>
                                    <p className="text-xs font-medium text-slate-500 mt-0.5">This action will update basket status to ASSIGNED</p>
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={clearAll} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-black text-sm hover:bg-slate-200 transition-colors">CLEAR</button>
                                    <button
                                        onClick={handleAssign}
                                        disabled={assigning}
                                        className="bg-[#116A29] hover:bg-[#0e5621] text-white rounded-lg font-bold uppercase shadow-md transition-all flex items-center justify-center gap-2 px-5 py-2.5 active:scale-95 text-sm"
                                    >
                                        {assigning ? <><Loader2 size={14} className="animate-spin" />ASSIGNING…</> : <>ASSIGN BASKETS <ChevronRight size={14} /></>}
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

export default BasketAssign;
