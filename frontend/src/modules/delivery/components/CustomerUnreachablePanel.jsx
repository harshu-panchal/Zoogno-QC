import React, { useCallback, useEffect, useState } from "react";
import { MapPin, PhoneCall, PhoneOff, Clock, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import Card from "@/shared/components/ui/Card";
import { deliveryApi } from "../services/deliveryApi";
import { getCurrentPositionWithCache } from "../utils/deliveryLastLocation";
import {
  getOrderSocket,
  onOrderStatusUpdate,
} from "@/core/services/orderSocket";

const getPosition = () =>
  new Promise((resolve) => {
    getCurrentPositionWithCache(resolve, () => resolve(null), {
      maxCacheAgeMs: 20 * 60 * 1000,
    });
  });

const formatCountdown = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

/**
 * Rider-side "Reached customer location → call → Customer Unreachable" flow.
 * The rider can only REPORT; the admin decides (cancel / retry).
 */
const CustomerUnreachablePanel = ({ order }) => {
  const orderId = order?.orderId;
  const customerPhone = order?.address?.phone;

  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(Date.now());
  // Server clock offset so the countdown does not depend on the phone's clock.
  const [clockOffset, setClockOffset] = useState(0);

  const load = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await deliveryApi.getUnreachableState(orderId);
      const data = res.data?.result;
      setState(data);
      if (data?.rules?.serverNow) {
        setClockOffset(new Date(data.rules.serverNow).getTime() - Date.now());
      }
    } catch {
      /* panel is optional — never block the normal delivery screen */
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const iv = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!orderId) return undefined;
    const getToken = () => localStorage.getItem("auth_delivery");
    getOrderSocket(getToken);
    const off = onOrderStatusUpdate(getToken, (payload) => {
      if (payload?.orderId && payload.orderId !== orderId) return;
      load();
      if (payload?.unreachableResolved === "RETRY") {
        toast.info("Admin asked you to retry the delivery.");
      }
      if (payload?.cancelType === "CUSTOMER_UNREACHABLE") {
        toast.info("Admin cancelled this order (customer unreachable).");
      }
    });
    return off;
  }, [orderId, load]);

  const workflowStatus = String(state?.workflowStatus || "").toUpperCase();
  const caseStatus = state?.case?.status;

  if (!state) return null;
  if (!["OUT_FOR_DELIVERY", "CUSTOMER_UNREACHABLE", "CANCELLED"].includes(workflowStatus)) {
    return null;
  }
  // A plain cancelled order (not an unreachable cancel) has nothing to show here.
  if (workflowStatus === "CANCELLED" && state.unreachableState !== "CANCELLED") {
    return null;
  }

  const handleReached = async () => {
    setBusy(true);
    try {
      const pos = await getPosition();
      const res = await deliveryApi.markReachedCustomer(orderId, pos ? { lat: pos.lat, lng: pos.lng } : {});
      const data = res.data?.result;
      setState((prev) => ({ ...prev, case: data.case, rules: data.rules }));
      if (data?.rules?.serverNow) {
        setClockOffset(new Date(data.rules.serverNow).getTime() - Date.now());
      }
      toast.success("Marked: reached customer location");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not mark reached");
    } finally {
      setBusy(false);
    }
  };

  const handleCall = async () => {
    if (!customerPhone) {
      toast.error("Customer phone number not available");
      return;
    }
    setBusy(true);
    try {
      const res = await deliveryApi.recordCustomerCall(orderId);
      const data = res.data?.result;
      setState((prev) => ({ ...prev, case: data.case, rules: data.rules }));
      window.location.href = `tel:${customerPhone}`;
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not record call");
    } finally {
      setBusy(false);
    }
  };

  const handleUnreachable = async () => {
    if (
      !window.confirm(
        "Report this customer as unreachable? Admin will review and decide. You cannot cancel the order yourself.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const pos = await getPosition();
      const res = await deliveryApi.markCustomerUnreachable(
        orderId,
        pos ? { lat: pos.lat, lng: pos.lng } : {},
      );
      const data = res.data?.result;
      setState((prev) => ({
        ...prev,
        workflowStatus: "CUSTOMER_UNREACHABLE",
        case: data.case,
        rules: data.rules,
      }));
      toast.success("Reported to admin. Please wait for their decision.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not report customer unreachable");
      load();
    } finally {
      setBusy(false);
    }
  };

  /* ---------- Cancelled by admin ---------- */
  if (workflowStatus === "CANCELLED") {
    return (
      <Card className="p-5 rounded-3xl border border-red-100 bg-red-50/60 mb-3">
        <div className="flex items-center gap-2 text-red-700 font-bold">
          <XCircle size={20} /> Order cancelled by admin
        </div>
        <p className="text-sm text-red-600 mt-1">
          Customer was unreachable. No further action is needed for this order.
        </p>
      </Card>
    );
  }

  /* ---------- Waiting for admin ---------- */
  if (workflowStatus === "CUSTOMER_UNREACHABLE" || caseStatus === "CUSTOMER_UNREACHABLE") {
    return (
      <Card className="p-5 rounded-3xl border border-amber-200 bg-amber-50 mb-3">
        <div className="flex items-center gap-2 text-amber-800 font-bold">
          <ShieldAlert size={20} /> Customer Unreachable – waiting for admin
        </div>
        <p className="text-sm text-amber-700 mt-1">
          Admin has been notified. Stay near the delivery location until they either cancel the
          order or ask you to retry.
        </p>
      </Card>
    );
  }

  /* ---------- Not yet marked reached ---------- */
  if (!state.case) {
    return (
      <Card className="p-5 rounded-3xl shadow-sm border border-slate-100 mb-3">
        <div className="flex items-center gap-2 mb-1 text-gray-800">
          <MapPin size={20} className="text-brand-600" />
          <h3 className="font-bold">At the customer's location?</h3>
        </div>
        <p className="text-gray-500 text-xs mb-3">
          Tap once you reach the drop location. If the customer does not respond, you can then call
          them and report them as unreachable.
        </p>
        <button
          onClick={handleReached}
          disabled={busy}
          className="w-full bg-black text-white rounded-2xl py-3 font-bold text-sm disabled:opacity-60"
        >
          {busy ? "Please wait..." : "REACHED CUSTOMER LOCATION"}
        </button>
      </Card>
    );
  }

  /* ---------- Reached: call + report ---------- */
  const rules = state.rules || {};
  const now = tick + clockOffset;
  const unlockMs = rules.unlockAt ? new Date(rules.unlockAt).getTime() - now : 0;
  const attempts = state.case.callAttemptCount || 0;
  const attemptsOk = attempts >= (rules.minCallAttempts || 0);
  const waitOk = unlockMs <= 0;
  const canReport = attemptsOk && waitOk;

  return (
    <Card className="p-5 rounded-3xl shadow-sm border border-orange-100 mb-3">
      <div className="flex items-center gap-2 mb-1 text-gray-800">
        <MapPin size={20} className="text-orange-600" />
        <h3 className="font-bold">Reached customer location</h3>
      </div>
      <p className="text-gray-500 text-xs mb-3">
        Call the customer. If they do not answer, you can report them as unreachable.
      </p>

      <button
        onClick={handleCall}
        disabled={busy || !customerPhone}
        className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-2xl py-3 font-bold text-sm disabled:opacity-60"
      >
        <PhoneCall size={16} /> CALL CUSTOMER
      </button>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className={`rounded-xl px-3 py-2 border ${attemptsOk ? "bg-green-50 border-green-200 text-green-700" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
          <div className="font-bold">Call attempts</div>
          <div>
            {attempts} / {rules.minCallAttempts || 0} required
          </div>
        </div>
        <div className={`rounded-xl px-3 py-2 border flex items-center gap-1 ${waitOk ? "bg-green-50 border-green-200 text-green-700" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
          <Clock size={14} />
          <div>
            <div className="font-bold">Wait time</div>
            <div>{waitOk ? "Done" : formatCountdown(unlockMs)}</div>
          </div>
        </div>
      </div>

      <button
        onClick={handleUnreachable}
        disabled={busy || !canReport}
        className="mt-3 w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white rounded-2xl py-3 font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <PhoneOff size={16} /> CUSTOMER UNREACHABLE
      </button>
      {!canReport && (
        <p className="text-[11px] text-gray-400 mt-2 text-center">
          Available after {rules.minCallAttempts || 0} call attempt(s) and a{" "}
          {rules.minWaitMinutes || 0} minute wait at the location.
        </p>
      )}
    </Card>
  );
};

export default CustomerUnreachablePanel;
