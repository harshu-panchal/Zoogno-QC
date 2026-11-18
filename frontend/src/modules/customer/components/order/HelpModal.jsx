import React from "react";
import {
  AlertCircle,
  ChevronRight,
  MessageCircle,
  PackageX,
  Phone,
  PlusCircle,
  Truck,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useSettings } from "@core/context/SettingsContext";

const HelpModal = ({ isOpen, onClose, order, onReportIssue, onTrackOrder }) => {
  const { settings } = useSettings();
  const orderId = String(order?.orderId || "").trim();
  const supportPhone = String(settings?.supportPhone || "").trim();
  const supportPhoneHref = supportPhone
    ? `tel:${supportPhone.replace(/(?!^\+)[^\d]/g, "")}`
    : "";
  const chatHref = orderId
    ? `/chat?orderId=${encodeURIComponent(orderId)}`
    : "/chat";

  const issues = [
    {
      icon: PackageX,
      label: "Items missing or incorrect",
      sub: "Get help with a missing or wrong item",
      issueType: "MISSING_PRODUCT",
    },
    {
      icon: AlertCircle,
      label: "Item quality issue",
      sub: "Report a damaged or expired item",
      issueType: "PRODUCT_DAMAGED",
    },
    {
      icon: Truck,
      label: "Delivery delay",
      sub: "View the latest order tracking status",
      onSelect: onTrackOrder,
    },
  ];

  const selectIssue = (issue) => {
    onClose?.();
    if (issue.onSelect) {
      issue.onSelect();
      return;
    }
    onReportIssue?.(issue.issueType);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm"
          role="presentation"
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(event) => event.stopPropagation()}
            className="bg-white rounded-t-[2rem] sm:rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-help-title"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 id="order-help-title" className="text-xl font-black text-slate-800">Need Help?</h2>
                  <p className="text-sm text-slate-500 font-medium">
                    {orderId ? `Select an issue with order #${orderId}` : "Select an issue with your order"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 bg-slate-50 rounded-full hover:bg-slate-100 transition-colors"
                  aria-label="Close order help"
                >
                  <X size={20} className="text-slate-500" />
                </button>
              </div>

              <div className="space-y-3 mb-8">
                {issues.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => selectIssue(item)}
                    className="w-full flex items-center justify-between p-4 rounded-2xl border border-slate-100 hover:border-brand-200 hover:bg-brand-50/50 transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 group-hover:bg-white group-hover:text-primary transition-colors">
                        <item.icon size={20} />
                      </div>
                      <div className="text-left">
                        <h3 className="font-bold text-slate-800 text-sm group-hover:text-primary transition-colors">{item.label}</h3>
                        <p className="text-xs text-slate-400 font-medium">{item.sub}</p>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-slate-300 group-hover:text-primary transition-colors" />
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => selectIssue({ issueType: "OTHER" })}
                  className="col-span-2 py-3.5 rounded-xl border-2 border-primary text-primary font-bold flex items-center justify-center gap-2 hover:bg-brand-50 transition-colors shadow-lg shadow-brand-50"
                >
                  <PlusCircle size={18} /> Raise a Ticket
                </button>
                <Link
                  to={chatHref}
                  onClick={onClose}
                  className="py-3.5 rounded-xl bg-slate-900 text-white font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors"
                >
                  <MessageCircle size={18} /> Chat Us
                </Link>
                {supportPhoneHref ? (
                  <a
                    href={supportPhoneHref}
                    className="py-3.5 rounded-xl border border-slate-200 text-slate-700 font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors"
                  >
                    <Phone size={18} /> Call Us
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    title="Support number is not configured"
                    className="py-3.5 rounded-xl border border-slate-200 text-slate-400 font-bold flex items-center justify-center gap-2 cursor-not-allowed"
                  >
                    <Phone size={18} /> Call Us
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default HelpModal;
