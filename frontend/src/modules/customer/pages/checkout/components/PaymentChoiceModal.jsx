import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Banknote, Check, CreditCard, ShieldCheck, Sparkles, Wallet, X, Zap } from "lucide-react";

/**
 * PaymentChoiceModal
 *
 * Shown when the customer slides to place the order. Nothing is pre-selected: the customer
 * picks how they want to pay and then taps Proceed.
 *
 * Props:
 *   open          - boolean
 *   options       - [{ id: "online" | "cash" | "wallet", label?, sublabel? }]  (only usable methods)
 *   amount        - number, what is still to be paid
 *   initialChoice - id the customer had already tapped in the payment list (highlighted, not forced)
 *   onClose       - () => void
 *   onConfirm     - (id) => void
 *
 * Gradients are inline styles on purpose: they are the point of this popup, and inline CSS renders
 * identically whatever the Tailwind gradient-class syntax in use.
 */
const THEMES = {
  online: {
    icon: CreditCard,
    gradient: "linear-gradient(135deg,#38bdf8 0%,#6366f1 55%,#8b5cf6 100%)",
    tint: "linear-gradient(135deg,#eff6ff 0%,#eef2ff 100%)",
    accent: "#6366f1",
    glow: "rgba(99,102,241,0.35)",
    title: "Pay Online",
    sub: "UPI · Cards · NetBanking",
    perk: { icon: Zap, text: "Instant & secure" },
    perkStyle: { background: "#e0e7ff", color: "#4338ca" },
    cta: "Proceed to Pay Online",
  },
  cash: {
    icon: Banknote,
    gradient: "linear-gradient(135deg,#fbbf24 0%,#f97316 55%,#ef4444 100%)",
    tint: "linear-gradient(135deg,#fffbeb 0%,#fff1f2 100%)",
    accent: "#f97316",
    glow: "rgba(249,115,22,0.35)",
    title: "Cash on Delivery",
    sub: "Pay when your order arrives",
    perk: { icon: Sparkles, text: "No advance payment" },
    perkStyle: { background: "#ffedd5", color: "#c2410c" },
    cta: "Place Order · Cash on Delivery",
  },
  wallet: {
    icon: Wallet,
    gradient: "linear-gradient(135deg,#e879f9 0%,#a855f7 55%,#6d28d9 100%)",
    tint: "linear-gradient(135deg,#fdf4ff 0%,#f5f3ff 100%)",
    accent: "#a855f7",
    glow: "rgba(168,85,247,0.35)",
    title: "Wallet",
    sub: "Pay from your wallet balance",
    perk: { icon: Zap, text: "Instant" },
    perkStyle: { background: "#f3e8ff", color: "#7e22ce" },
    cta: "Pay with Wallet",
  },
};

const PRIMARY_GRADIENT = "linear-gradient(135deg,#10b981 0%,#059669 50%,#047857 100%)";
const HEADER_GRADIENT = "linear-gradient(135deg,#059669 0%,#0d9488 50%,#0891b2 100%)";

const formatAmount = (n) =>
  Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function PaymentChoiceModal({ open, options = [], amount = 0, initialChoice = null, onClose, onConfirm }) {
  const [choice, setChoice] = useState(null);

  // Start from whatever the customer had tapped in the list (if anything) - never a default of ours.
  useEffect(() => {
    if (open) {
      setChoice(options.some((o) => o.id === initialChoice) ? initialChoice : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  const chosenTheme = choice ? THEMES[choice] : null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label="Choose payment method"
        >
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={onClose}
            data-testid="payment-choice-backdrop"
          />

          <motion.div
            className="relative w-full overflow-hidden bg-white shadow-2xl sm:max-w-md"
            style={{ borderRadius: "2rem 2rem 0 0" }}
            initial={{ y: 90, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 90, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
          >
            {/* ── Colourful header ── */}
            <div className="relative overflow-hidden px-6 pb-7 pt-6 text-white" style={{ background: HEADER_GRADIENT }}>
              <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/15" />
              <div className="pointer-events-none absolute -bottom-12 left-10 h-28 w-28 rounded-full bg-white/10" />
              <div className="pointer-events-none absolute right-16 top-16 h-6 w-6 rounded-full bg-amber-300/70" />

              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur transition hover:bg-white/30"
              >
                <X size={18} strokeWidth={3} />
              </button>

              <p className="text-[11px] font-black uppercase tracking-[0.25em] text-white/80">Almost there</p>
              <h2 className="mt-1 text-2xl font-black leading-tight tracking-tight">How would you like to pay?</h2>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-1.5 backdrop-blur">
                <span className="text-[11px] font-bold uppercase tracking-widest text-white/80">Amount</span>
                <span className="text-lg font-black">₹{formatAmount(amount)}</span>
              </div>
            </div>

            {/* ── Options ── */}
            <div className="space-y-3 px-5 pb-2 pt-5">
              {options.map((opt, index) => {
                const theme = THEMES[opt.id] || THEMES.online;
                const Icon = theme.icon;
                const PerkIcon = theme.perk.icon;
                const selected = choice === opt.id;
                return (
                  <motion.button
                    key={opt.id}
                    type="button"
                    onClick={() => setChoice(opt.id)}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.06 * index + 0.08 }}
                    whileTap={{ scale: 0.98 }}
                    aria-pressed={selected}
                    className="flex w-full items-center gap-4 rounded-3xl border-2 p-4 text-left transition-all"
                    style={{
                      borderColor: selected ? theme.accent : "#e2e8f0",
                      background: selected ? theme.tint : "#ffffff",
                      boxShadow: selected ? `0 10px 28px ${theme.glow}` : "0 1px 2px rgba(15,23,42,0.04)",
                    }}
                  >
                    <span
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg"
                      style={{ background: theme.gradient, boxShadow: `0 8px 18px ${theme.glow}` }}
                    >
                      <Icon size={26} strokeWidth={2.4} />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-black tracking-tight text-slate-900">{opt.label || theme.title}</span>
                      <span className="mt-0.5 block text-xs font-semibold text-slate-500">{theme.sub}</span>
                      <span
                        className="mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide"
                        style={theme.perkStyle}
                      >
                        <PerkIcon size={11} strokeWidth={3} /> {theme.perk.text}
                      </span>
                    </span>

                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-all"
                      style={{
                        borderColor: selected ? theme.accent : "#cbd5e1",
                        background: selected ? theme.gradient : "#ffffff",
                      }}
                    >
                      {selected && <Check size={15} strokeWidth={4} className="text-white" />}
                    </span>
                  </motion.button>
                );
              })}
            </div>

            {/* ── Proceed ── */}
            <div className="px-5 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-4">
              <button
                type="button"
                disabled={!choice}
                onClick={() => choice && onConfirm?.(choice)}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-black tracking-wide text-white transition-all active:scale-[0.98] disabled:cursor-not-allowed"
                style={
                  choice
                    ? { background: PRIMARY_GRADIENT, boxShadow: "0 14px 32px rgba(5,150,105,0.4)" }
                    : { background: "#cbd5e1", boxShadow: "none" }
                }
              >
                {chosenTheme ? chosenTheme.cta : "Select a payment method"}
              </button>
              <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-400">
                <ShieldCheck size={13} /> 100% secure checkout
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
