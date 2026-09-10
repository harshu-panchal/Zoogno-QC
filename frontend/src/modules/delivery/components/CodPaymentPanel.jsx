import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle, IndianRupee, QrCode, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { deliveryApi } from "../services/deliveryApi";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";

function getCodDue(order) {
  return Math.max(
    0,
    Number(order?.paymentBreakdown?.grandTotal ?? order?.pricing?.total ?? 0) -
      Number(order?.paymentBreakdown?.walletAmount ?? order?.pricing?.walletAmount ?? 0),
  );
}

function isCodOrder(order) {
  const method = String(order?.payment?.method || "").toLowerCase();
  return order?.paymentMode === "COD" || method === "cash" || method === "cod";
}

function isCodPaid(order) {
  return Boolean(
    order?.financeFlags?.codMarkedCollected ||
      order?.codCollectionMethod === "UPI_QR" ||
      order?.codCollectionMethod === "CASH" ||
      order?.paymentStatus === "PAID",
  );
}

export default function CodPaymentPanel({ order, orderId, onPaid }) {
  const [mode, setMode] = useState("choose");
  const [qr, setQr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusLabel, setStatusLabel] = useState("Waiting for customer payment");

  const amount = useMemo(() => getCodDue(order), [order]);
  const paid = isCodPaid(order);
  const viaUpi = order?.codCollectionMethod === "UPI_QR";

  useEffect(() => {
    if (paid) setMode("paid");
  }, [paid]);

  useEffect(() => {
    if (mode !== "qr" || !qr?.merchantOrderId || paid) return undefined;
    const timer = setInterval(async () => {
      try {
        const res = await deliveryApi.getCodQrStatus(orderId);
        const result = res.data?.result || {};
        if (result.paid) {
          setStatusLabel("Payment received");
          toast.success("COD paid via UPI QR");
          onPaid?.(result);
        } else if (result.paymentStatus === "failed" || result.paymentStatus === "expired") {
          setStatusLabel(
            result.paymentStatus === "expired"
              ? "QR expired — generate a new one"
              : "Payment failed — try again or collect cash",
          );
        }
      } catch (_) {
        /* keep polling */
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [mode, qr?.merchantOrderId, paid, orderId, onPaid]);

  if (!isCodOrder(order) || amount <= 0) return null;

  if (paid) {
    return (
      <Card className="p-4 border-l-4 border-l-emerald-500 bg-emerald-50/40">
        <div className="flex items-center gap-3">
          <CheckCircle className="text-emerald-600" size={28} />
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
              COD collected
            </p>
            <p className="text-lg font-black text-slate-900">
              ₹{amount} · {viaUpi ? "UPI QR" : "Cash"}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const startQr = async () => {
    try {
      setLoading(true);
      const res = await deliveryApi.createCodQr(orderId);
      const result = res.data?.result || {};
      if (result.alreadyPaid) {
        toast.success("This COD is already paid");
        onPaid?.(result);
        return;
      }
      setQr(result);
      setMode("qr");
      setStatusLabel("Waiting for customer payment");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not generate UPI QR");
    } finally {
      setLoading(false);
    }
  };

  const qrSrc =
    qr?.qrPayload && String(qr.qrPayload).startsWith("data:")
      ? qr.qrPayload
      : qr?.qrPayload
        ? `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(qr.qrPayload)}`
        : null;

  return (
    <Card className="p-4 border-l-4 border-l-orange-500 bg-orange-50/40 space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-orange-700">
          Ask customer: cash or UPI?
        </p>
        <p className="text-3xl font-extrabold text-orange-600">₹{amount}</p>
      </div>

      {mode === "choose" && (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setMode("cash")}
            className="rounded-xl border border-orange-200 bg-white p-3 text-left hover:border-orange-400"
          >
            <IndianRupee className="text-orange-600 mb-1" size={20} />
            <p className="text-sm font-black">Cash Payment</p>
            <p className="text-[11px] text-slate-500">Ask customer, then collect cash</p>
          </button>
          <button
            type="button"
            onClick={startQr}
            disabled={loading}
            className="rounded-xl border border-brand-200 bg-white p-3 text-left hover:border-brand-400 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="animate-spin text-brand-600 mb-1" size={20} />
            ) : (
              <QrCode className="text-brand-600 mb-1" size={20} />
            )}
            <p className="text-sm font-black">Pay via UPI QR</p>
            <p className="text-[11px] text-slate-500">Ask customer, then show QR</p>
          </button>
        </div>
      )}

      {mode === "cash" && (
        <p className="text-sm text-slate-600">
          Collect ₹{amount} in cash, then complete delivery OTP. Cash is recorded automatically after delivery.
        </p>
      )}

      {mode === "qr" && (
        <div className="flex flex-col items-center gap-3">
          {qrSrc ? (
            <img src={qrSrc} alt="COD UPI QR" className="w-56 h-56 bg-white p-2 rounded-xl border" />
          ) : (
            <Loader2 className="animate-spin" />
          )}
          <p className="text-sm font-semibold text-slate-700">{statusLabel}</p>
          <p className="text-xs text-slate-400">Do not mark this paid yourself — wait for confirmation.</p>
          <Button variant="ghost" type="button" onClick={() => setMode("choose")}>
            Back
          </Button>
        </div>
      )}
    </Card>
  );
}
