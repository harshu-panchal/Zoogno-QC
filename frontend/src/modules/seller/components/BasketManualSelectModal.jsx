import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineMagnifyingGlass, HiOutlineXMark, HiOutlineArchiveBox, HiOutlineCheckCircle } from 'react-icons/hi2';
import { sellerApi } from '../services/sellerApi';
import { useToast } from '@shared/components/ui/Toast';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import Button from '@shared/components/ui/Button';

const BasketManualSelectModal = ({ isOpen, onClose, onSelect, currentBasketId }) => {
    const [baskets, setBaskets] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const { showToast } = useToast();

    useEffect(() => {
        if (isOpen) {
            fetchAvailableBaskets();
        } else {
            setSearchTerm('');
            setBaskets([]);
        }
    }, [isOpen]);

    const fetchAvailableBaskets = async (search = '') => {
        setLoading(true);
        try {
            // Using AVAILABLE which should map to both ASSIGNED and AVAILABLE in backend
            const params = { status: 'AVAILABLE', limit: 50 };
            if (search) params.search = search;

            const res = await sellerApi.getBasketInventory(params);
            setBaskets(res.data?.data || []);
        } catch (error) {
            console.error('Failed to fetch available baskets:', error);
            showToast('Failed to load available baskets', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Debounced search
    useEffect(() => {
        if (!isOpen) return;
        const delayDebounceFn = setTimeout(() => {
            fetchAvailableBaskets(searchTerm);
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [searchTerm, isOpen]);

    const handleSelect = (basketId) => {
        if (basketId === currentBasketId) {
            showToast('This basket is already linked to the current order', 'warning');
            return;
        }
        onSelect(basketId);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
                onClick={onClose}
            />
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="w-full max-w-md relative z-10 bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                            <HiOutlineArchiveBox className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-slate-900">Select Available Basket</h3>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Manual Assignment</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500">
                        <HiOutlineXMark className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-4 border-b border-slate-100 bg-white">
                    <div className="relative">
                        <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
                        <input
                            type="text"
                            placeholder="Search by Basket ID (e.g. BSK000125)"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-primary/20 outline-none placeholder:text-slate-400"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-10">
                            <Loader2 className="h-8 w-8 text-primary animate-spin" />
                            <p className="text-xs font-bold text-slate-500 mt-3 uppercase tracking-widest">Searching Baskets...</p>
                        </div>
                    ) : baskets.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                            <HiOutlineArchiveBox className="h-12 w-12 text-slate-300 mb-3" />
                            <p className="text-sm font-bold text-slate-800">No baskets found</p>
                            <p className="text-xs text-slate-500 font-medium mt-1 max-w-[200px]">
                                {searchTerm ? "Try adjusting your search criteria." : "You don't have any baskets available for assignment."}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {baskets.map(basket => (
                                <div
                                    key={basket._id}
                                    onClick={() => handleSelect(basket.basketId)}
                                    className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                                            <HiOutlineArchiveBox className="h-4 w-4 text-slate-500 group-hover:text-primary" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-slate-900">{basket.basketId}</p>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase">Size: {basket.size || 'Medium'}</p>
                                        </div>
                                    </div>
                                    <Button size="sm" variant="outline" className="h-7 text-[10px] px-3 font-bold rounded-lg group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-colors">
                                        SELECT
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

export default BasketManualSelectModal;
