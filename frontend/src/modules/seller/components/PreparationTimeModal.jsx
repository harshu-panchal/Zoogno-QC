import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { HiOutlineClock } from 'react-icons/hi2';
import Button from '@shared/components/ui/Button';
import { cn } from '@/lib/utils';

/**
 * Prompts the seller for a preparation time when accepting an order.
 * Shared by the Orders page and the Dashboard so every accept path asks consistently.
 */
const PreparationTimeModal = ({
  isOpen,
  orderId,
  defaultMinutes = 10,
  maxMinutes = 20,
  isSubmitting = false,
  onCancel,
  onConfirm,
}) => {
  const [minutes, setMinutes] = useState(Math.min(defaultMinutes, maxMinutes));

  // Reset to the configured default whenever a new order's modal opens.
  useEffect(() => {
    if (isOpen) setMinutes(Math.min(defaultMinutes, maxMinutes));
  }, [isOpen, orderId, defaultMinutes, maxMinutes]);

  if (!isOpen) return null;

  const quickPicks = [5, 10, 15, 20, 30].filter((m) => m <= maxMinutes);

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4" data-lenis-prevent="true">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={() => !isSubmitting && onCancel?.()}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-sm relative z-10 bg-white rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-5 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
          <div className="h-10 w-10 bg-primary text-primary-foreground rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <HiOutlineClock className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900">Set Preparation Time</h3>
            {orderId && (
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">#{orderId}</p>
            )}
          </div>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm font-semibold text-slate-600">
            How long will this order take to prepare? The customer sees this as the "being prepared" time, and riders are alerted ahead of the ready time.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="1"
              max={maxMinutes}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="w-28 px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-lg font-black text-slate-900 outline-none focus:ring-2 focus:ring-primary/10 text-center"
            />
            <span className="text-sm font-bold text-slate-600">minutes</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {quickPicks.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMinutes(m)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                  Number(minutes) === m
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                {m}m
              </button>
            ))}
          </div>
          <p className="text-[11px] font-bold text-slate-400">Maximum allowed: {maxMinutes} minutes</p>
        </div>
        <div className="p-5 pt-0 flex gap-3">
          <Button
            variant="outline"
            disabled={isSubmitting}
            onClick={() => onCancel?.()}
            className="flex-1 rounded-xl font-bold"
          >
            Cancel
          </Button>
          <Button
            disabled={isSubmitting}
            onClick={() => onConfirm?.(parseInt(minutes, 10))}
            className="flex-1 rounded-xl font-bold bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isSubmitting ? 'Accepting...' : 'Accept Order'}
          </Button>
        </div>
      </motion.div>
    </div>,
    document.body
  );
};

export default PreparationTimeModal;
