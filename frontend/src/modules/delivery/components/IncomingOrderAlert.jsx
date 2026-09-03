import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BellRing, MapPin } from "lucide-react";

/** Match server `deliverySearchExpiresAt` — progress bar + countdown stay aligned when modal opens late. */
function secondsLeftUntilDeliveryExpiry(expiresAt) {
  if (!expiresAt) return 60;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 1000));
}

/**
 * Owns the incoming-order countdown's per-second tick locally so it doesn't
 * re-render DeliveryLayout (and everything under its <Outlet/>, e.g. a live
 * map) every second. DeliveryLayout still owns the actual accept/skip/expiry
 * business logic — this component is display-only.
 */
const IncomingOrderAlert = ({ activeOrder, isAcceptingOrder, onAccept, onSkip }) => {
  const [timeLeft, setTimeLeft] = useState(60);
  const [acceptWindowTotal, setAcceptWindowTotal] = useState(60);

  // Reset the countdown display whenever a *new* order object arrives, without
  // doing it inside an effect (which would call setState synchronously in the
  // effect body). This is React's documented pattern for adjusting state in
  // response to a prop change: https://react.dev/learn/you-might-not-need-an-effect
  const [prevActiveOrder, setPrevActiveOrder] = useState(activeOrder);
  if (activeOrder !== prevActiveOrder) {
    setPrevActiveOrder(activeOrder);
    const left = secondsLeftUntilDeliveryExpiry(activeOrder?.expiresAt);
    setTimeLeft(left);
    setAcceptWindowTotal(left > 0 ? left : 60);
  }

  // Tick the countdown once a second — a legitimate effect subscription
  // (timer → setState), recomputed from the deadline each tick so it can
  // never drift from the server-provided expiry.
  useEffect(() => {
    if (!activeOrder) return undefined;
    const left = secondsLeftUntilDeliveryExpiry(activeOrder.expiresAt);
    if (left <= 0) return undefined;

    const timer = setInterval(() => {
      setTimeLeft(secondsLeftUntilDeliveryExpiry(activeOrder.expiresAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [activeOrder]);

  return (
    <AnimatePresence>
      {activeOrder && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/85 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delivery-order-alert-title"
        >
          <motion.div
            key={activeOrder.id}
            initial={{ scale: 0.92, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 16 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="bg-white rounded-[32px] p-6 w-full max-w-[340px] shadow-2xl border-4 border-primary/20"
          >
            <div className="flex flex-col items-center">
              <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mb-4 animate-bounce">
                <BellRing className="h-8 w-8 text-primary" />
              </div>

              <h2
                id="delivery-order-alert-title"
                className="text-xl font-black text-slate-900 mb-1"
              >
                {activeOrder.isReturnPickup ? "Return pickup request" : "New order request"}
              </h2>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                {activeOrder.isReturnPickup ? "Collect return item" : "Accept or reject"}
              </p>
              <div className="bg-slate-100/80 px-3 py-1 rounded-lg mb-4 border border-slate-200">
                <span className="text-[11px] font-black text-slate-700 tracking-widest">#{activeOrder.id}</span>
              </div>
              <div className="flex items-center gap-2 mb-6">
                <span className="text-2xl font-black text-brand-600">₹{activeOrder.earnings}</span>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-['Poppins',_sans-serif]">
                  Earnings
                </span>
              </div>

              <div className="w-full space-y-4 mb-6">
                {/* Return Items "Small Cart" */}
                {activeOrder.isReturnPickup && activeOrder.items?.length > 0 && (
                  <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100 flex flex-col gap-2">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">
                      Return Items ({activeOrder.items.length})
                    </p>
                    <div className="flex gap-2 overflow-x-auto no-scrollbar">
                      {activeOrder.items.map((item, idx) => (
                        <div key={idx} className="flex-shrink-0 flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-100 shadow-sm min-w-[140px]">
                          <div className="h-10 w-10 rounded-lg bg-slate-100 overflow-hidden flex-shrink-0">
                            {item.image ? (
                              <img src={item.image} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-slate-300 font-bold text-[8px]">
                                NO IMG
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-bold text-slate-900 truncate mb-0.5">
                              {item.name}
                            </p>
                            <p className="text-[10px] font-black text-primary">
                              {item.quantity} Unit{item.quantity > 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-brand-100 flex items-center justify-center mt-1">
                    <div className="w-2 h-2 rounded-full bg-black " />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">
                      {activeOrder.isReturnPickup ? "Customer Pickup" : "Pickup"}
                    </p>
                    <p className="text-sm font-bold text-slate-900">{activeOrder.pickup}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-rose-500 mt-1 shrink-0" />
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">
                      {activeOrder.isReturnPickup ? "Return To Seller" : "Drop"}
                    </p>
                    <p className="text-sm font-bold text-slate-900 line-clamp-2">{activeOrder.drop}</p>
                  </div>
                </div>
              </div>

              <div className="w-full h-1.5 bg-slate-100 rounded-full mb-2 overflow-hidden">
                <motion.div
                  key={`${activeOrder.id}-${acceptWindowTotal}`}
                  initial={{ width: "100%" }}
                  animate={{ width: "0%" }}
                  transition={{
                    duration: Math.max(1, acceptWindowTotal || 60),
                    ease: "linear",
                  }}
                  className={timeLeft < 10 ? "bg-rose-500 h-full" : "bg-primary h-full"}
                />
              </div>
              <p className="text-[10px] font-bold text-slate-400 mb-4 w-full text-center">
                {timeLeft}s left to respond
              </p>

              <div className="grid grid-cols-2 gap-4 w-full">
                <button
                  type="button"
                  onClick={onSkip}
                  disabled={isAcceptingOrder}
                  className="py-4 rounded-2xl bg-slate-100 text-slate-700 font-black text-xs uppercase tracking-wider hover:bg-slate-200/80 disabled:opacity-50 disabled:pointer-events-none"
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={onAccept}
                  disabled={isAcceptingOrder}
                  className="py-4 rounded-2xl bg-primary text-primary-foreground font-black text-xs uppercase tracking-wider shadow-lg shadow-primary/30 active:scale-95 disabled:opacity-60 disabled:pointer-events-none"
                >
                  {isAcceptingOrder ? "Accepting…" : "Accept"}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default IncomingOrderAlert;
