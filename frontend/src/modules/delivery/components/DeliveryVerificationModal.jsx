import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  User,
  MapPin,
  Package,
  CheckCircle2,
} from "lucide-react";
import Button from "@/shared/components/ui/Button";

const DeliveryVerificationModal = ({ isOpen, order, onVerify, onClose }) => {
  if (!isOpen || !order) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white rounded-[2rem] w-full max-w-md overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="bg-brand-50 p-6 flex flex-col items-center justify-center text-center relative">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm relative">
              <ShieldCheck className="text-brand-600" size={32} />
              <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-1 border-2 border-white">
                <CheckCircle2 className="text-white" size={12} />
              </div>
            </div>
            <h2 className="text-xl font-black text-slate-800">Verify Customer</h2>
            <p className="text-sm text-slate-500 mt-1 font-medium">
              Please confirm these details match the customer before handing over the package.
            </p>
          </div>

          <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
            {/* Customer Details */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Customer Information
              </h3>
              <div className="bg-slate-50 rounded-2xl p-4 space-y-3 border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                    <User size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Name</p>
                    <p className="text-sm font-bold text-slate-800">
                      {order.address?.name || order.customer?.name || "N/A"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 pt-2 border-t border-slate-200">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0 mt-0.5">
                    <MapPin size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Delivery Address</p>
                    <p className="text-sm font-bold text-slate-800 leading-tight">
                      {order.address?.address || "Address not available"}
                    </p>
                    {order.address?.phone && (
                      <p className="text-xs text-slate-500 mt-1">
                        📞 {order.address.phone}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Order Items */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                Order Items
                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px]">
                  {order.items?.length || 0} items
                </span>
              </h3>
              
              <div className="space-y-3 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                {(order.items || []).map((item, index) => (
                  <div 
                    key={index} 
                    className="flex items-center gap-3 p-3 rounded-2xl border border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 overflow-hidden shrink-0">
                      <img 
                        src={item.image || item.product?.mainImage || "/placeholder.png"} 
                        alt={item.name}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.src = "/placeholder.png"; }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">
                        {item.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                          Qty: {item.quantity}
                        </span>
                        <span className="text-xs font-bold text-brand-600">
                          ₹{item.price * item.quantity}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-6 border-t border-slate-100 bg-white space-y-3">
            <button
              className="w-full flex items-center justify-center h-14 rounded-2xl text-base font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/25 transition-colors"
              onClick={onVerify}
            >
              <ShieldCheck className="mr-2" size={20} />
              VERIFY & CONTINUE
            </button>
            <button
              onClick={onClose}
              className="w-full py-3 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default DeliveryVerificationModal;
