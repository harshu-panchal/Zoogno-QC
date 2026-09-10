import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle,
  Camera,
  IndianRupee,
  ArrowRight,
  ShieldCheck,
  Home,
} from "lucide-react";
import { motion } from "framer-motion";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import confetti from "canvas-confetti";

import { useParams } from "react-router-dom";
import { deliveryApi } from "../services/deliveryApi";
import { toast } from "sonner";
import DeliverySlideButton from "../components/DeliverySlideButton";
import OtpInput from "../components/OtpInput";
import CodPaymentPanel from "../components/CodPaymentPanel";

const DeliveryConfirmation = () => {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [otpGenerated, setOtpGenerated] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [earningsBreakdown, setEarningsBreakdown] = useState(null);

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        setLoading(true);
        const res = await deliveryApi.getOrderDetails(orderId);
        if (res.data.success) {
          setOrder(res.data.result);
        }
      } catch (error) {
        toast.error("Failed to load order details");
      } finally {
        setLoading(false);
      }
    };
    fetchOrder();
  }, [orderId]);

  const handleOtpGenerated = (data) => {
    console.log("OTP generated successfully:", data);
    setOtpGenerated(true);
  };

  const handleOtpGenerationError = (error) => {
    console.error("Failed to generate OTP:", error);
  };

  const handleOtpValidationSuccess = (data) => {
    const breakdown =
      data?.result?.data?.earningsBreakdown ||
      data?.result?.earningsBreakdown ||
      data?.data?.earningsBreakdown ||
      null;
    setEarningsBreakdown(breakdown);
    setIsCompleted(true);
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["var(--primary)", "#3b82f6", "#f59e0b"],
    });
  };

  const handleOtpValidationError = (error) => {
    console.error("OTP validation error:", error);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  const method = String(order?.payment?.method || "").toLowerCase();
  const isPrepaid =
    order?.paymentMode === "ONLINE" ||
    order?.paymentMode === "WALLET" ||
    (method !== "cash" && method !== "cod" && order?.paymentMode !== "COD");
  const codPaid =
    order?.financeFlags?.codMarkedCollected ||
    order?.codCollectionMethod === "UPI_QR" ||
    order?.paymentStatus === "PAID";

  const baseEarning = Number(earningsBreakdown?.baseEarning ?? order?.paymentBreakdown?.riderPayoutTotal ?? 0);
  const surgeCharge = Number(earningsBreakdown?.surgeCharge ?? 0);
  const totalEarning = Number(
    earningsBreakdown?.totalEarning ?? baseEarning + surgeCharge,
  );
  const surgeItems = Array.isArray(earningsBreakdown?.surgeItems)
    ? earningsBreakdown.surgeItems
    : [];

  if (isCompleted) {
    return (
      <div className="min-h-screen bg-brand-50 flex flex-col items-center justify-center p-6 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className="bg-white rounded-full p-6 shadow-xl mb-6">
          <CheckCircle className="text-brand-500 w-24 h-24" strokeWidth={1.5} />
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-3xl font-bold text-gray-900 mb-2">
          Delivery Successful!
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-gray-500 mb-6">
          Order #{orderId} has been delivered.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="w-full max-w-sm bg-white rounded-3xl shadow-xl border border-slate-100 p-5 text-left mb-8"
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
            Earnings breakdown
          </p>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-600">Base Earning</span>
              <span className="font-bold text-slate-900">₹{baseEarning}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div>
                <span className="font-medium text-slate-600">Surge Charge</span>
                {surgeItems.length > 0 ? (
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {surgeItems.map((i) => i.name).join(", ")}
                  </p>
                ) : null}
              </div>
              <span className="font-bold text-amber-600">
                {surgeCharge > 0 ? `+₹${surgeCharge}` : "₹0"}
              </span>
            </div>
            <div className="border-t border-slate-100 pt-2.5 flex items-center justify-between">
              <span className="font-black text-slate-900">Total Earning</span>
              <span className="font-black text-brand-600 text-lg">₹{totalEarning}</span>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}>
          <Button
            onClick={() => navigate("/delivery/dashboard")}
            className="px-8">
            Back to Dashboard
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50/50 min-h-screen flex flex-col p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 pt-2">
        <h1 className="ds-h2 text-gray-900">Confirm Delivery</h1>
        <div className="text-xs font-bold text-gray-400">Order: #{orderId}</div>
      </div>

      <div className="flex-1 space-y-6 max-w-lg mx-auto w-full">
        {(isPrepaid || codPaid) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}>
            <Card className="p-6 border-l-4 border-l-brand-500 bg-brand-50/30">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Payment Status
                  </p>
                  <h2 className="text-4xl font-extrabold text-brand-600">
                    {codPaid && !isPrepaid
                      ? order?.codCollectionMethod === "UPI_QR"
                        ? "PAID (UPI QR)"
                        : "CASH COLLECTED"
                      : "PAID"}
                  </h2>
                </div>
                <div className="p-3 rounded-full bg-brand-100 text-brand-600">
                  <CheckCircle size={32} />
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Security OTP */}
        {!otpGenerated ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}>
            <Card className="p-6">
              <div className="flex items-center mb-4 text-gray-800">
                <ShieldCheck className="mr-2 text-primary" size={24} />
                <h3 className="font-bold text-lg">Generate Delivery OTP</h3>
              </div>
              <p className="text-gray-500 text-sm mb-4">
                Slide the button below to generate an OTP for the customer. You must be within 0-120 meters of the delivery location.
              </p>

              <DeliverySlideButton
                orderId={orderId}
                onSuccess={handleOtpGenerated}
                onError={handleOtpGenerationError}
              />
            </Card>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}>
            <Card className="p-6">
              <OtpInput
                orderId={orderId}
                onSuccess={handleOtpValidationSuccess}
                onError={handleOtpValidationError}
              />
            </Card>
          </motion.div>
        )}

        {!isPrepaid && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}>
            <CodPaymentPanel
              order={order}
              orderId={orderId}
              onPaid={async () => {
                try {
                  const res = await deliveryApi.getOrderDetails(orderId);
                  if (res.data.success) setOrder(res.data.result);
                } catch (_) {
                  /* ignore */
                }
              }}
            />
          </motion.div>
        )}

        {/* Proof of Delivery (Optional) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}>
          <Card className="p-0 overflow-hidden">
            <button className="w-full p-4 flex flex-col items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors">
              <Camera size={32} className="mb-2 text-gray-400" />
              <span className="font-medium text-sm">
                Upload Photo Proof (Optional)
              </span>
            </button>
          </Card>
        </motion.div>
      </div>
    </div >
  );
};

export default DeliveryConfirmation;

