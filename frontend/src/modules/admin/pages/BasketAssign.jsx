import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Card from '@shared/components/ui/Card';
import PageHeader from '@shared/components/ui/PageHeader';
import { adminBasketsApi } from '../services/api/basketApi';
import axiosInstance from '@core/api/axios'; // For custom fetching
import { toast } from 'sonner';
import {
    Search, ShoppingBasket, Users, CheckCircle2, Loader2, X,
    ChevronRight, Package, AlertCircle, FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSearchParams, useNavigate } from 'react-router-dom';

const BasketAssign = () => {
    const [searchParams] = useSearchParams();
    const initialSellerId = searchParams.get('sellerId');
    const navigate = useNavigate();

    const [sellers, setSellers] = useState([]);
    const [availableBaskets, setAvailableBaskets] = useState([]);
    const [selectedSeller, setSelectedSeller] = useState(null);
    const [sellerRequests, setSellerRequests] = useState([]);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [selectedBasketIds, setSelectedBasketIds] = useState([]);
    const [sellerSearch, setSellerSearch] = useState('');
    const [basketSearch, setBasketSearch] = useState('');
    const [sizeFilter, setSizeFilter] = useState('ALL');
    const [loading, setLoading] = useState(false);
    const [requestsLoading, setRequestsLoading] = useState(false);
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
            if (Array.isArray(selData)) {
                setSellers(selData);
                if (initialSellerId) {
                    const initial = selData.find(s => s._id === initialSellerId);
                    if (initial) setSelectedSeller(initial);
                }
            }
            if (Array.isArray(basketData)) setAvailableBaskets(basketData);
        } catch (err) {
            console.error("Failed to fetch assign data:", err);
            toast.error("Failed to load sellers or basket inventory");
        } finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);

    // Fetch seller's paid requests when a seller is selected
    useEffect(() => {
        if (!selectedSeller) {
            setSellerRequests([]);
            setSelectedRequest(null);
            return;
        }
        const fetchRequests = async () => {
            setRequestsLoading(true);
            try {
                const res = await axiosInstance.get(`/admin/baskets/requests?sellerId=${selectedSeller._id}&status=payment_completed`);
                setSellerRequests(res.data?.data || []);
                if (res.data?.data?.length > 0) {
                    // Auto-select the first one
                    setSelectedRequest(res.data.data[0]);
                    setSizeFilter(res.data.data[0].size.toUpperCase());
                } else {
                    setSelectedRequest(null);
                }
            } catch (err) {
                console.error("Failed to fetch requests for seller:", err);
            } finally {
                setRequestsLoading(false);
            }
        };
        fetchRequests();
    }, [selectedSeller]);

    const filteredSellers = sellers.filter(s =>
        !sellerSearch ||
        s.name.toLowerCase().includes(sellerSearch.toLowerCase()) ||
        s.shopName?.toLowerCase().includes(sellerSearch.toLowerCase())
    );

    const filteredBaskets = availableBaskets.filter(b =>
        (!basketSearch || b.basketId.toLowerCase().includes(basketSearch.toLowerCase())) &&
        (sizeFilter === 'ALL' || b.size?.toUpperCase() === sizeFilter)
    );

    const toggleBasket = (basketId) => {
        const basket = availableBaskets.find(b => b.basketId === basketId);
        if (!basket) return;

        if (selectedRequest) {
            if (basket.size?.toUpperCase() !== selectedRequest.size?.toUpperCase()) {
                toast.error(`Please select ${selectedRequest.size} baskets for this request.`);
                return;
            }
        }

        setSelectedBasketIds(prev => {
            if (prev.includes(basketId)) {
                return prev.filter(id => id !== basketId);
            } else {
                if (selectedRequest && prev.length >= (selectedRequest.approvedQuantity || selectedRequest.quantity)) {
                    toast.error(`You only need to assign ${selectedRequest.approvedQuantity || selectedRequest.quantity} baskets.`);
                    return prev;
                }
                return [...prev, basketId];
            }
        });
    };

    const selectAll = () => {
        if (selectedRequest) {
            const size = selectedRequest.size.toUpperCase();
            const matchingBaskets = filteredBaskets.filter(b => b.size?.toUpperCase() === size);
            const needed = selectedRequest.approvedQuantity || selectedRequest.quantity;
            setSelectedBasketIds(matchingBaskets.slice(0, needed).map(b => b.basketId));
        } else {
            setSelectedBasketIds(filteredBaskets.map(b => b.basketId));
        }
    };
    const clearAll = () => setSelectedBasketIds([]);

    const handleAssign = async () => {
        if (!selectedSeller) { toast.error('Select a seller first'); return; }
        if (selectedBasketIds.length === 0) { toast.error('Select at least one basket'); return; }
        
        if (selectedRequest) {
            const needed = selectedRequest.approvedQuantity || selectedRequest.quantity;
            if (selectedBasketIds.length !== needed) {
                toast.error(`Please select exactly ${needed} baskets to fulfill this request.`);
                return;
            }
        }

        setAssigning(true);
        try {
            await adminBasketsApi.assignToSeller({ 
                sellerId: selectedSeller._id, 
                basketIds: selectedBasketIds,
                requestId: selectedRequest?._id
            });
            toast.success(`${selectedBasketIds.length} basket${selectedBasketIds.length > 1 ? 's' : ''} assigned to ${selectedSeller.name}`);
            setAvailableBaskets(prev => prev.filter(b => !selectedBasketIds.includes(b.basketId)));
            setSellers(prev => prev.map(s =>
                s._id === selectedSeller._id
                    ? { ...s, basketsAvailable: (s.basketsAvailable || 0) + selectedBasketIds.length }
                    : s
            ));
            setSelectedBasketIds([]);
            
            // Remove fulfilled request
            if (selectedRequest) {
                const updatedRequests = sellerRequests.filter(r => r._id !== selectedRequest._id);
                setSellerRequests(updatedRequests);
                if (updatedRequests.length > 0) {
                    setSelectedRequest(updatedRequests[0]);
                    setSizeFilter(updatedRequests[0].size.toUpperCase());
                } else {
                    setSelectedRequest(null);
                }
            } else {
                setSelectedSeller(null);
            }
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Assignment failed');
        } finally { setAssigning(false); }
    };

    return (
        <div className="space-y-6 pb-24">
            <PageHeader
                title="Assign Baskets to Sellers"
                description="Select baskets from inventory and assign them to a seller to fulfill their paid requests."
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[550px]">
                {/* Seller selection */}
                <div className="flex flex-col gap-4 h-full min-h-0">
                    <Card 
                        className="border-none shadow-sm ring-1 ring-slate-100 flex flex-col flex-1 min-h-0 overflow-hidden bg-white"
                        contentClassName="p-0 flex flex-col flex-1 min-h-0"
                    >
                        <div className="p-4 border-b border-slate-100 shrink-0">
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
                        <div className="p-4 space-y-2 overflow-y-auto flex-1 min-h-0 custom-scrollbar pr-2">
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
                                        onClick={() => {
                                            setSelectedSeller(seller);
                                            setSelectedBasketIds([]);
                                        }}
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

                    {/* Pending Requests Banner */}
                    <AnimatePresence>
                        {selectedSeller && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                                <Card className="border-none shadow-sm ring-1 ring-amber-200 bg-amber-50">
                                    <div className="p-4">
                                        <p className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
                                            <FileText size={13} />Pending Paid Requests
                                        </p>
                                        {requestsLoading ? (
                                            <div className="flex justify-center py-4">
                                                <Loader2 size={16} className="text-amber-600 animate-spin" />
                                            </div>
                                        ) : sellerRequests.length === 0 ? (
                                            <div className="flex items-center gap-3 text-emerald-700 bg-emerald-100/50 p-3 rounded-xl border border-emerald-200">
                                                <CheckCircle2 size={18} />
                                                <p className="text-sm font-bold">No pending paid requests. You can manually assign baskets freely.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar pr-1">
                                                {sellerRequests.map(req => (
                                                    <button
                                                        key={req._id}
                                                        onClick={() => {
                                                            setSelectedRequest(req);
                                                            setSizeFilter(req.size.toUpperCase());
                                                            setSelectedBasketIds([]);
                                                        }}
                                                        className={cn(
                                                            "w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left",
                                                            selectedRequest?._id === req._id
                                                                ? "border-amber-400 bg-white ring-2 ring-amber-200 shadow-sm"
                                                                : "border-amber-200 bg-amber-100/50 hover:bg-amber-100"
                                                        )}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={cn(
                                                                "h-10 w-10 rounded-lg flex items-center justify-center shrink-0 border",
                                                                selectedRequest?._id === req._id ? "bg-amber-100 border-amber-300 text-amber-700" : "bg-white border-amber-200 text-amber-600"
                                                            )}>
                                                                <ShoppingBasket size={18} />
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-bold text-slate-900">
                                                                    Needs {req.approvedQuantity || req.quantity} {req.size} Baskets
                                                                </p>
                                                                <p className="text-xs font-semibold text-slate-500">Paid: ₹{req.totalAmount}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col items-end">
                                                            {selectedRequest?._id === req._id && (
                                                                <span className="text-[10px] font-black text-amber-600 bg-amber-100 px-2 py-1 rounded mb-1">SELECTED</span>
                                                            )}
                                                            <span className="text-[10px] font-bold text-slate-400">{new Date(req.createdAt).toLocaleDateString()}</span>
                                                        </div>
                                                    </button>
                                                ))}
                                                <p className="text-xs font-medium text-amber-700 mt-2 flex items-center gap-1.5 bg-amber-100/50 p-2 rounded-lg">
                                                    <AlertCircle size={12} />
                                                    Selecting a request restricts basket assignment to fulfill it precisely.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </Card>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Basket selection */}
                <Card 
                    className="border-none shadow-sm ring-1 ring-slate-100 flex flex-col h-full min-h-0 overflow-hidden bg-white"
                    contentClassName="p-0 flex flex-col flex-1 min-h-0"
                >
                    <div className="p-4 border-b border-slate-100 shrink-0">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <ShoppingBasket size={13} />Available Baskets ({filteredBaskets.length})
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
                        <div className="flex gap-2 mt-3 overflow-x-auto scrollbar-hide pb-1">
                            {['ALL', 'SMALL', 'MEDIUM', 'LARGE'].map(size => (
                                <button
                                    key={size}
                                    onClick={() => {
                                        if (selectedRequest && selectedRequest.size.toUpperCase() !== size && size !== 'ALL') {
                                            toast.error(`Must select ${selectedRequest.size} baskets to fulfill this request.`);
                                            return;
                                        }
                                        setSizeFilter(size);
                                    }}
                                    className={cn(
                                        'px-3 py-1.5 rounded-lg text-[10px] font-black transition-all whitespace-nowrap',
                                        sizeFilter === size ? 'bg-[#116A29] text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                    )}
                                >
                                    {size}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="p-4 flex-1 overflow-y-auto min-h-0 custom-scrollbar pr-2">
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
                            <div className="space-y-6">
                                {['SMALL', 'MEDIUM', 'LARGE'].map(size => {
                                    const sizeBaskets = filteredBaskets.filter(b => b.size?.toUpperCase() === size);
                                    if (sizeBaskets.length === 0) return null;
                                    return (
                                        <div key={size}>
                                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-100 pb-1">{size} Baskets ({sizeBaskets.length})</h4>
                                            <div className="grid grid-cols-2 gap-2">
                                                {sizeBaskets.map(basket => {
                                                    const isSelected = selectedBasketIds.includes(basket.basketId);
                                                    const isDisabled = selectedRequest && basket.size?.toUpperCase() !== selectedRequest.size?.toUpperCase();
                                                    
                                                    return (
                                                        <button
                                                            key={basket._id}
                                                            onClick={() => !isDisabled && toggleBasket(basket.basketId)}
                                                            disabled={isDisabled}
                                                            className={cn(
                                                                'flex items-center gap-2 p-3 rounded-xl border text-left transition-all',
                                                                isSelected
                                                                    ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200'
                                                                    : isDisabled ? 'border-slate-100 bg-slate-50/40 opacity-50 cursor-not-allowed' : 'border-slate-100 bg-slate-50/60 hover:bg-slate-100/60'
                                                            )}
                                                        >
                                                            <div className={cn(
                                                                'h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all',
                                                                isSelected ? 'border-indigo-600 bg-indigo-600' : isDisabled ? 'border-slate-200 bg-slate-100' : 'border-slate-300 bg-white'
                                                            )}>
                                                                {isSelected && <CheckCircle2 size={12} className="text-white" />}
                                                            </div>
                                                            <div>
                                                                <p className={cn("text-[11px] font-black font-mono", isDisabled ? "text-slate-400" : "text-slate-900")}>{basket.basketId}</p>
                                                                <p className={cn("text-[10px] font-semibold uppercase", isDisabled ? "text-slate-400" : "text-slate-500")}>{basket.size}</p>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
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
                    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-3xl px-4 z-50">
                        <Card className="border-none shadow-2xl ring-2 ring-indigo-300 p-5 bg-white/95 backdrop-blur-md">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                <div className="flex-1">
                                    <p className="text-base font-black text-slate-900">
                                        Assigning <span className="text-indigo-700">{selectedBasketIds.length} basket{selectedBasketIds.length !== 1 ? 's' : ''}</span> to <span className="text-indigo-700">{selectedSeller.name}</span>
                                    </p>
                                    <p className="text-xs font-semibold text-slate-500 mt-1">
                                        {selectedRequest ? (
                                            <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 size={12} /> This will fulfill the selected paid request</span>
                                        ) : "This action will update basket status to ASSIGNED"}
                                    </p>
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={clearAll} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-black text-sm hover:bg-slate-200 transition-colors">CLEAR</button>
                                    <button
                                        onClick={handleAssign}
                                        disabled={assigning}
                                        className="bg-[#116A29] hover:bg-[#0e5621] text-white rounded-xl font-bold uppercase shadow-lg shadow-green-900/20 transition-all flex items-center justify-center gap-2 px-6 py-2.5 active:scale-95 text-sm"
                                    >
                                        {assigning ? <><Loader2 size={16} className="animate-spin" />ASSIGNING…</> : <>ASSIGN BASKETS <ChevronRight size={16} /></>}
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
