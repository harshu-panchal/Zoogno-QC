import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineChevronDown, HiCheck } from 'react-icons/hi2';
import { cn } from '@/lib/utils';

const CustomSelect = ({ 
    value, 
    onChange, 
    options = [], 
    placeholder = "Select...", 
    disabled = false,
    className = "",
    dropdownClassName = "",
    isAbsolute = true
}) => {
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

    const selectedOption = options.find(opt => String(opt.value) === String(value));

    return (
        <div className={cn("relative w-full", disabled && "opacity-50 cursor-not-allowed")} ref={dropdownRef}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className={cn(
                    "flex items-center justify-between w-full px-4 py-2.5 bg-slate-100 rounded-md text-sm font-bold text-left outline-none transition-all focus:ring-2 focus:ring-primary/5",
                    !selectedOption ? "text-slate-500 font-semibold" : "text-slate-800",
                    className
                )}
            >
                <span className="truncate pr-4">
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <HiOutlineChevronDown className={cn("absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 opacity-60 transition-transform duration-200 shrink-0", isOpen && "rotate-180")} />
            </button>

            <AnimatePresence>
                {isOpen && !disabled && (
                    <motion.div
                        initial={{ opacity: 0, y: -5, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -5, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className={cn(
                            isAbsolute ? "absolute z-[999]" : "relative z-10",
                            "mt-1.5 w-full bg-white rounded-lg shadow-xl border border-slate-100 overflow-hidden py-1 max-h-60 overflow-y-auto custom-scrollbar",
                            dropdownClassName
                        )}
                    >
                        {options.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onChange(option.value);
                                    setIsOpen(false);
                                }}
                                className={cn(
                                    "w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold transition-colors border-none !rounded-none !m-0",
                                    String(value) === String(option.value)
                                        ? "!bg-primary/10 !text-primary" 
                                        : "!bg-transparent !text-slate-700 hover:!bg-slate-100 hover:!text-slate-900"
                                )}
                            >
                                <span className="truncate text-left">{option.label}</span>
                                {String(value) === String(option.value) && (
                                    <HiCheck className="h-4 w-4 shrink-0 text-primary" />
                                )}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default CustomSelect;
