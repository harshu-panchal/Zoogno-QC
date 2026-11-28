import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, CheckCircle2, X } from "lucide-react";
import confetti from "canvas-confetti";

/**
 * Triggers a multi-stage sky shot / fireworks confetti celebration
 * bursting diagonally from the top corners and raining down glittering stars.
 */
export const triggerOfferCelebration = () => {
  // Wave 1: Sky shot bursts from top-left and top-right
  confetti({
    particleCount: 70,
    angle: 60,
    spread: 60,
    origin: { x: 0, y: 0.15 },
    colors: ["#10b981", "#6366f1", "#f59e0b", "#ec4899", "#3b82f6", "#14b8a6"],
    zIndex: 99999,
  });

  confetti({
    particleCount: 70,
    angle: 120,
    spread: 60,
    origin: { x: 1, y: 0.15 },
    colors: ["#10b981", "#6366f1", "#f59e0b", "#ec4899", "#3b82f6", "#14b8a6"],
    zIndex: 99999,
  });

  // Wave 2: Central sky shot bursting glittering golden stars & circles
  setTimeout(() => {
    confetti({
      particleCount: 80,
      spread: 90,
      origin: { x: 0.5, y: 0.2 },
      shapes: ["star", "circle"],
      colors: ["#fbbf24", "#f59e0b", "#10b981", "#ffffff", "#8b5cf6"],
      scalar: 1.2,
      zIndex: 99999,
    });
  }, 220);

  // Wave 3: Follow-up streamers from top sides
  setTimeout(() => {
    confetti({
      particleCount: 45,
      angle: 75,
      spread: 45,
      origin: { x: 0.15, y: 0.05 },
      colors: ["#10b981", "#fbbf24", "#3b82f6"],
      zIndex: 99999,
    });
    confetti({
      particleCount: 45,
      angle: 105,
      spread: 45,
      origin: { x: 0.85, y: 0.05 },
      colors: ["#ec4899", "#8b5cf6", "#fbbf24"],
      zIndex: 99999,
    });
  }, 480);
};

const CouponCelebrationModal = ({ data, onClose }) => {
  useEffect(() => {
    if (data) {
      triggerOfferCelebration();
    }
  }, [data]);

  if (!data) return null;

  const { code, discountAmount, discountType, description } = data;
  const formattedDiscount =
    discountAmount && Number(discountAmount) > 0
      ? `₹${Number(discountAmount).toFixed(0)}`
      : discountType === "percentage"
      ? "Extra Discount"
      : "Great Savings";

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/65 backdrop-blur-md"
        />

        {/* Modal Card Container */}
        <motion.div
          initial={{ scale: 0.7, opacity: 0, y: 40, rotateX: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0, rotateX: 0 }}
          exit={{ scale: 0.8, opacity: 0, y: 30 }}
          transition={{ type: "spring", stiffness: 320, damping: 25 }}
          className="relative w-full max-w-sm rounded-[32px] bg-gradient-to-b from-white via-amber-50/40 to-emerald-50/50 p-6 sm:p-7 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35)] border border-white/80 overflow-hidden text-center z-10 select-none"
        >
          {/* Top Decorative Sunburst Glow */}
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 bg-gradient-to-br from-amber-300/40 via-emerald-300/30 to-violet-300/20 rounded-full blur-3xl pointer-events-none" />

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close celebration"
            className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-slate-100/90 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-all active:scale-90"
          >
            <X size={16} />
          </button>

          {/* Animated Hero Badge */}
          <div className="relative mx-auto mb-4 flex items-center justify-center">
            {/* Pulsing ring */}
            <motion.div
              animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0.15, 0.6] }}
              transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
              className="absolute w-24 h-24 rounded-full bg-gradient-to-r from-amber-400 to-emerald-400 blur-md pointer-events-none"
            />

            {/* Rosette Container */}
            <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-400 via-orange-400 to-emerald-500 p-[3px] shadow-[0_10px_25px_-5px_rgba(245,158,11,0.5)]">
              <div className="w-full h-full rounded-[21px] bg-white flex flex-col items-center justify-center">
                <span className="text-3xl leading-none">🎉</span>
              </div>
            </div>

            {/* Sparkling Floating Stars */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
              className="absolute -top-1 -right-1 text-amber-500"
            >
              <Sparkles size={20} className="fill-amber-400 drop-shadow-sm" />
            </motion.div>
          </div>

          {/* Celebratory Title */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/10 via-emerald-500/10 to-teal-500/10 border border-amber-500/20 text-amber-800 text-[11px] font-black uppercase tracking-widest mb-2 shadow-xs">
            <Sparkles size={12} className="text-amber-600 fill-amber-500" />
            <span>Savings Unlocked!</span>
          </div>

          <h3 className="text-2xl sm:text-[26px] font-black text-slate-900 tracking-tight leading-tight mb-2">
            Woohoo! You Saved <span className="text-emerald-600 underline decoration-emerald-300 decoration-wavy decoration-2">{formattedDiscount}</span>
          </h3>

          {/* Coupon Code Pill */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-slate-900 text-white font-mono text-xs font-black tracking-wider uppercase shadow-md my-1">
            <CheckCircle2 size={14} className="text-emerald-400" />
            <span>{code}</span>
          </div>

          {/* Creative Happiness Description */}
          <p className="mt-3 text-xs sm:text-[13px] font-medium text-slate-600 leading-relaxed px-1">
            {description
              ? description
              : "That's extra happiness in your pocket! Sit back while we prepare your delicious order."}
          </p>

          {/* Confirm Button */}
          <button
            type="button"
            onClick={onClose}
            className="mt-6 w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-sm uppercase tracking-wider shadow-[0_10px_25px_-5px_rgba(16,185,129,0.45)] hover:shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <span>Awesome, Continue!</span>
            <span className="text-base">🚀</span>
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default CouponCelebrationModal;
