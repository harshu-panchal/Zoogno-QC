import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineChevronDown } from 'react-icons/hi2';
import { cn } from '@/lib/utils';
import { getOrderStatusVariant } from '@/modules/seller/components/orders';

const STATUS_OPTIONS = [
    { value: 'pending', label: 'Pending' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'packed', label: 'Packed' },
    { value: 'out_for_delivery', label: 'Out for Delivery' },
    { value: 'delivered', label: 'Delivered' },
    { value: 'cancelled', label: 'Cancelled' }
];

const StatusDropdown = ({ value, onChange, variant = 'default' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = STATUS_OPTIONS.find(opt => opt.value === (value || '').toLowerCase()) || STATUS_OPTIONS[0];
    const statusColor = getOrderStatusVariant(value);

    const colorClasses = 
        statusColor === 'warning' ? "bg-amber-100 text-amber-700 hover:bg-amber-200/80" :
        statusColor === 'info' ? "bg-brand-100 text-brand-700 hover:bg-brand-200/80" :
        statusColor === 'primary' ? "bg-brand-100 text-brand-700 hover:bg-brand-200/80" :
        statusColor === 'secondary' ? "bg-purple-100 text-purple-700 hover:bg-purple-200/80" :
        statusColor === 'success' ? "bg-brand-100 text-brand-700 hover:bg-brand-200/80" :
        statusColor === 'error' ? "bg-rose-100 text-rose-700 hover:bg-rose-200/80" :
        "bg-slate-100 text-slate-700 hover:bg-slate-200/80";

    const baseClasses = variant === 'modal' 
        ? "w-full text-[10px] pl-3 pr-8 py-2 rounded-xl font-black uppercase tracking-wider transition-all shadow-sm outline-none"
        : variant === 'table'
        ? "w-full text-[10px] pl-3 pr-8 py-1.5 rounded-full font-black uppercase tracking-widest transition-all shadow-sm outline-none"
        : "w-full min-w-[100px] text-[10px] pl-2 pr-6 py-1.5 rounded-lg font-black uppercase transition-all outline-none";

    return (
        <div className="relative inline-block w-full" ref={dropdownRef} onClick={(e) => e.stopPropagation()}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={cn("flex items-center justify-between border border-transparent w-full", baseClasses, colorClasses)}
            >
                <span className="truncate">
                    {variant === 'table' ? (selectedOption.value === 'out_for_delivery' ? 'Out for Delivery' : selectedOption.label) : 
                     variant === 'modal' ? selectedOption.label :
                     (selectedOption.value === 'out_for_delivery' ? 'Out' : selectedOption.label)}
                </span>
                <HiOutlineChevronDown className={cn("absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 opacity-60 transition-transform duration-200 shrink-0", isOpen && "rotate-180")} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -5, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -5, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className={cn(
                            "absolute z-[9999] mt-1 w-40 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden py-1",
                            variant === 'modal' ? "bottom-full mb-1 right-0" : "top-full right-0"
                        )}
                    >
                        {STATUS_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onChange(option.value);
                                    setIsOpen(false);
                                }}
                                className={cn(
                                    "w-full text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
                                    (value || '').toLowerCase() === option.value 
                                        ? "bg-primary/5 text-primary" 
                                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                )}
                            >
                                {option.label}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default StatusDropdown;
