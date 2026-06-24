import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/core/context/AuthContext";
import {
  Phone,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Navigation,
  Package,
  CheckCircle,
  Store,
  User,
  AlertTriangle,
  ShieldCheck,
  ScanLine,
  QrCode,
  Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import { toast } from "sonner";
import { deliveryApi } from "../services/deliveryApi";
import { Loader2 } from "lucide-react";
import DeliveryTrackingMap from "../components/DeliveryTrackingMap";
import DeliveryOrderChatModal from "../components/DeliveryOrderChatModal";
import DeliverySlideButton from "../components/DeliverySlideButton";
import OtpInput from "../components/OtpInput";
import ReturnPickupProofUpload from "../components/ReturnPickupProofUpload";
import DeliveryVerificationModal from "../components/DeliveryVerificationModal";
import QRScanner from "@shared/components/ui/QRScanner";
import {
  getCachedDeliveryPartnerLocation,
  getCurrentPositionWithCache,
} from "../utils/deliveryLastLocation";
import {
  getOrderSocket,
  joinOrderRoom,
  leaveOrderRoom,
  onOrderStatusUpdate,
} from "@/core/services/orderSocket";

const getPublicStatusStage = (internalStep) => {
  if (internalStep >= 4) return 3;
  if (internalStep >= 3) return 2;
  return 1;
};

// Maps return backend status → 5-step UI
// Step 1: Accepted, navigate to customer
// Step 2: At customer, upload proof + customer OTP
// Step 3: In transit, navigate to seller
// Step 4: At seller, request seller OTP
// Step 5: Completed
const orderOfReturn = (s) => {
  if (!s || s === "none") return 1;
  const lower = s.toLowerCase();
  if (["returned", "qc_passed", "qc_failed", "refund_completed"].includes(lower)) return 5;
  if (lower === "return_drop_pending") return 4;
  if (lower === "return_in_transit") return 3;
  if (lower === "return_pickup_assigned") return 1;
  return 1; // return_approved also = 1
};

const PUBLIC_STATUS_STEPS = [
  { id: 1, label: "Confirmed" },
  { id: 2, label: "Out for Delivery" },
  { id: 3, label: "Delivered" },
];

const RETURN_PUBLIC_STATUS_STEPS = [
  { id: 1, label: "Assigned" },
  { id: 2, label: "Out for Pickup" },
  { id: 3, label: "Dropped off" },
];

const getPersistedRiderStep = (order) => {
  if (!order) return 1;

  // Handle Return Flow Steps (5-step UI)
  if (order.returnStatus && order.returnStatus !== "none") {
    const rs = order.returnStatus.toLowerCase();
    if (["returned", "qc_passed", "qc_failed", "refund_completed"].includes(rs)) return 5;
    if (rs === "return_drop_pending") return 4;
    if (rs === "return_in_transit") return 3;
    if (rs === "return_pickup_assigned" || rs === "return_approved") return 1;
  }

  const workflowStatus = String(order.workflowStatus || "").toUpperCase();
  const legacyStatus = String(order.status || "").toLowerCase();
  const riderStep = Number(order.deliveryRiderStep) || 0;

  if (
    riderStep >= 4 ||
    workflowStatus === "DELIVERED" ||
    legacyStatus === "delivered"
  ) {
    return 4;
  }

  if (
    riderStep >= 3 ||
    workflowStatus === "OUT_FOR_DELIVERY" ||
    legacyStatus === "out_for_delivery" ||
    order.outForDeliveryAt
  ) {
    return 3;
  }

  if (
    riderStep >= 2 ||
    workflowStatus === "PICKUP_READY" ||
    legacyStatus === "packed" ||
    order.pickupReadyAt
  ) {
    return 2;
  }

  return 1;
};

const DEFAULT_CITY_SPEED_KMPH = 24;

const hasValidLatLng = (location) =>
  location &&
  typeof location.lat === "number" &&
  typeof location.lng === "number" &&
  Number.isFinite(location.lat) &&
  Number.isFinite(location.lng);

const toRadians = (value) => (value * Math.PI) / 180;

const distanceMeters = (from, to) => {
  if (!hasValidLatLng(from) || !hasValidLatLng(to)) return null;
  const r = 6371000;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatArrivalTime = (arrivalMs) =>
  new Date(arrivalMs).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

const formatArrivingIn = (minutes) => {
  if (!Number.isFinite(minutes) || minutes < 0) return "Soon";
  const rounded = Math.max(1, Math.round(minutes));
  return `${rounded} min${rounded === 1 ? "" : "s"}`;
};

const formatDistance = (meters) => {
  if (!Number.isFinite(meters) || meters <= 0) return "—";
  if (meters < 1000) {
    return `${Math.max(50, Math.round(meters / 10) * 10)} m`;
  }
  return `${(meters / 1000).toFixed(meters >= 10000 ? 1 : 2)} km`;
};

const estimateMinutesFromDistance = (meters) => {
  if (!Number.isFinite(meters) || meters <= 0) return null;
  return (meters * 60) / (DEFAULT_CITY_SPEED_KMPH * 1000);
};

const OrderDetails = () => {
  const { orderId } = useParams();
  const { user } = useAuth();
  const [accepting, setAccepting] = useState(false);
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1); // Internal rider flow: 1 pickup, 2 at store, 3 delivery, 4 delivered
  const [itemsExpanded, setItemsExpanded] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const [isSlideComplete, setIsSlideComplete] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [showDropOtpInput, setShowDropOtpInput] = useState(false);
  const [pickupProofSubmitted, setPickupProofSubmitted] = useState(false);
  const [routeStats, setRouteStats] = useState(null);
  const [clockTick, setClockTick] = useState(Date.now());
  // QR Bag scan state
  const [bagDeliveryScanDone, setBagDeliveryScanDone] = useState(false);
  const [deliveryScannerOpen, setDeliveryScannerOpen] = useState(false);
  const [bagPickupScanDone, setBagPickupScanDone] = useState(false);
  const [pickupScannerOpen, setPickupScannerOpen] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);


  const isReturn = order?.returnStatus && order.returnStatus !== "none";

  useEffect(() => {
    const fetchOrderDetails = async () => {
      try {
        const response = await deliveryApi.getOrderDetails(orderId);
        const ord = response.data.result;
        setOrder(ord);

        setStep(getPersistedRiderStep(ord));

        // Initialize bag scan states based on the bags returned with the order
        if (ord && ord.bags && ord.bags.length > 0) {
          const allPickupDone = ord.bags.every(
            (b) => b.status === "in_transit" || b.status === "delivered"
          );
          const allDeliveryDone = ord.bags.every(
            (b) => b.status === "delivered"
          );
          setBagPickupScanDone(allPickupDone);
          setBagDeliveryScanDone(allDeliveryDone);
        } else {
          // If no bags are assigned to the order, we default them to true so the scanner is not shown
          setBagPickupScanDone(true);
          setBagDeliveryScanDone(true);
        }
      } catch (error) {
        toast.error("Failed to fetch order details");
        navigate("/delivery/dashboard");
      } finally {
        setLoading(false);
      }
    };

    if (orderId) {
      fetchOrderDetails();
    }
  }, [orderId, navigate]);

  useEffect(() => {
    const iv = setInterval(() => setClockTick(Date.now()), 30000);
    return () => clearInterval(iv);
  }, []);

  // Listen for order:status:update — immediately hide map when delivered
  useEffect(() => {
    if (!orderId) return undefined;
    const getToken = () => localStorage.getItem("auth_delivery");
    getOrderSocket(getToken);
    joinOrderRoom(orderId, getToken);

    const off = onOrderStatusUpdate(getToken, (payload) => {
      const ws = String(payload?.workflowStatus || "").toUpperCase();
      if (ws === "DELIVERED") {
        setStep(4);
        setOrder((prev) => prev ? { ...prev, status: "delivered", workflowStatus: "DELIVERED" } : prev);
      }
    });

    return () => {
      off();
      leaveOrderRoom(orderId, getToken);
    };
  }, [orderId]);

  const steps = useMemo(() => {

    if (isReturn) {
      return [
        {
          id: 1,
          label: "Task Accepted",
          action: "NAVIGATE TO CUSTOMER",
          color: "bg-brand-500",
          bg: "bg-brand-50",
          text: "text-brand-600",
        },
        {
          id: 2,
          label: "At Customer",
          action: "UPLOAD PROOF & OTP",
          color: "bg-orange-500",
          bg: "bg-orange-50",
          text: "text-orange-600",
        },
        {
          id: 3,
          label: "In Transit",
          action: "NAVIGATE TO SELLER",
          color: "bg-purple-600",
          bg: "bg-purple-50",
          text: "text-purple-600",
        },
        {
          id: 4,
          label: "At Seller",
          action: "SELLER OTP VERIFY",
          color: "bg-green-600",
          bg: "bg-green-50",
          text: "text-green-600",
        },
        {
          id: 5,
          label: "Completed",
          action: "DONE",
          color: "bg-brand-700",
          bg: "bg-brand-50",
          text: "text-brand-700",
        },
      ];
    }

    return [
      {
        id: 1,
        label: "Navigate to Store",
        action: "ARRIVED AT STORE",
        color: "bg-black ",
        bg: "bg-brand-50",
        text: "text-brand-600",
      },
      {
        id: 2,
        label: "At Store",
        action: "PICKED UP ORDER",
        color: "bg-orange-500",
        bg: "bg-orange-50",
        text: "text-orange-600",
      },
      {
        id: 3,
        label: "Start Delivery",
        action: "START DELIVERY",
        color: "bg-black ",
        bg: "bg-brand-50",
        text: "text-brand-600",
      },
      {
        id: 4,
        label: "Delivering",
        action: "DELIVERED",
        color: "bg-brand-700",
        bg: "bg-brand-50",
        text: "text-brand-700",
      },
    ];
  }, [order?.returnStatus]);

  // For return flow: 5 steps map to 3 public stages
  // Steps 1-2 = Stage 1 (Return Assigned)
  // Steps 3-4 = Stage 2 (Out for Pickup)
  // Step 5    = Stage 3 (Return Received)
  const publicStatusStage = isReturn
    ? step >= 5 ? 3 : step >= 3 ? 2 : 1
    : getPublicStatusStage(step);
  const cachedRiderLocation = getCachedDeliveryPartnerLocation(30 * 60 * 1000);
  const destinationLocation = order?.address?.location;

  const summary = useMemo(() => {
    if (!order) {
      return {
        arrivalTimeText: "--",
        arrivingInText: "--",
        totalDistanceText: "—",
      };
    }

    if (publicStatusStage === 3) {
      return {
        arrivalTimeText: "Arrived",
        arrivingInText: isReturn ? "Return Complete" : "Delivered",
        totalDistanceText: "0 km",
      };
    }

    const routeDistanceMeters = Number(
      routeStats?.routeDistanceMeters ?? routeStats?.distanceMeters,
    );
    const routeDurationSeconds = Number(routeStats?.routeDurationSeconds);
    const riderLocation = routeStats?.rider || cachedRiderLocation;
    const sellerCoords = order?.seller?.location?.coordinates;
    const sellerLocation =
      Array.isArray(sellerCoords) && sellerCoords.length >= 2
        ? { lat: sellerCoords[1], lng: sellerCoords[0] }
        : null;
    // Return: steps 1-2 navigate to customer, steps 3-4 navigate to seller
    const targetLocation = isReturn
      ? step <= 2
        ? destinationLocation
        : sellerLocation
      : step <= 2
        ? sellerLocation
        : destinationLocation;

    let minutes = null;
    if (Number.isFinite(routeDurationSeconds) && routeDurationSeconds > 0) {
      minutes = routeDurationSeconds / 60;
    } else {
      minutes =
        estimateMinutesFromDistance(routeDistanceMeters) ??
        estimateMinutesFromDistance(distanceMeters(riderLocation, targetLocation));
    }

    if (!Number.isFinite(minutes) || minutes <= 0) {
      minutes = isReturn ? (step <= 2 ? 10 : 8) : step <= 2 ? 10 : 8;
    }

    const arrivalMs = clockTick + minutes * 60 * 1000;
    const totalDistanceMeters =
      routeDistanceMeters || distanceMeters(riderLocation, targetLocation);

    return {
      arrivalTimeText: formatArrivalTime(arrivalMs),
      arrivingInText: formatArrivingIn(minutes),
      totalDistanceText: formatDistance(totalDistanceMeters),
    };
  }, [
    cachedRiderLocation,
    clockTick,
    destinationLocation,
    isReturn,
    order,
    publicStatusStage,
    routeStats,
    step,
  ]);

  const handleNextStep = async () => {
    const currentStep = steps[step - 1];

    try {
      // Return pickup flow: slide button only advances UI steps (1→2, 3→4)
      // OTP flows handle actual status transitions
      if (order?.returnStatus && order.returnStatus !== "none") {
        if (step === 1) {
          // Accepted → Arrived at Customer: just advance UI to show proof upload
          setStep(2);
          setIsSlideComplete(false);
          setDragX(0);
          window.scrollTo({ top: 0, behavior: "smooth" });
          toast.success("Mark: Arrived at customer. Upload proof to continue.");
          return;
        } else if (step === 3) {
          // In transit → Arrived at Seller: advance UI to show seller OTP
          setStep(4);
          setIsSlideComplete(false);
          setDragX(0);
          window.scrollTo({ top: 0, behavior: "smooth" });
          toast.success("Mark: Arrived at seller. Request OTP to complete.");
          return;
        } else {
          // Steps 2 and 4 are handled by OTP flows, not the slide button
          return;
        }
      } else {
        const location = await new Promise((resolve, reject) => {
          getCurrentPositionWithCache(resolve, reject, {
            maxCacheAgeMs: 20 * 60 * 1000,
          });
        });

        if (step === 1) {
          const res = await deliveryApi.markArrivedAtStore(order.orderId, {
            lat: location.lat,
            lng: location.lng,
          });
          const updated = res.data.result;
          setOrder((prev) => ({ ...(prev || {}), ...updated }));
          setStep(2);
          toast.success(`${currentStep.action} Confirmed!`);
        } else if (step === 2) {
          const res = await deliveryApi.confirmPickup(order.orderId, {
            lat: location.lat,
            lng: location.lng,
          });
          const updated = res.data.result;
          setOrder((prev) => ({ ...(prev || {}), ...updated }));
          setStep(3);
          toast.success(`${currentStep.action} Confirmed!`);
        } else if (step === 3) {
          setStep(4);
          toast.success(`${currentStep.action} Confirmed!`);
        } else {
          navigate(`/delivery/confirm-delivery/${order.orderId}`);
        }

        setIsSlideComplete(false);
        setDragX(0);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (error) {
      console.error("Failed to update status", error);
      const message = error.response?.data?.message || "Failed to update status";
      toast.error(message);
    }
  };

  const handleNavigate = () => {
    const sellerCoords = order?.seller?.location?.coordinates;
    const sellerLocation =
      Array.isArray(sellerCoords) && sellerCoords.length >= 2
        ? { lat: sellerCoords[1], lng: sellerCoords[0] }
        : null;
    const customerLocation = order?.address?.location;

    const dest = isReturn
      ? step <= 1
        ? customerLocation
        : sellerLocation
      : step >= 3
        ? customerLocation
        : sellerLocation;

    if (
      dest &&
      typeof dest.lat === "number" &&
      typeof dest.lng === "number" &&
      Number.isFinite(dest.lat) &&
      Number.isFinite(dest.lng)
    ) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}`,
        "_blank"
      );
      return;
    }
    window.open("https://maps.google.com", "_blank");
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  const handleOtpGenerated = (data) => {
    console.log("OTP generated successfully:", data);
    setShowOtpInput(true);
    toast.success("OTP sent to customer!");
  };

  const handleOtpGenerationError = (error) => {
    console.error("Failed to generate OTP:", error);
  };

  const handleOtpValidationSuccess = (data) => {
    const updatedOrder = data?.result || data?.data?.result;

    setShowOtpInput(false);
    setPickupProofSubmitted(false);
    setIsSlideComplete(false);
    setDragX(0);

    if (isReturn) {
      // Return pickup OTP → navigate to seller for drop-off
      setStep(3);
      if (updatedOrder) setOrder(updatedOrder);
      window.scrollTo({ top: 0, behavior: "smooth" });
      toast.success("✅ Pickup verified! Navigate to seller for drop-off.");
    } else {
      // Standard delivery OTP → order is delivered, hide map immediately
      setStep(4);
      if (updatedOrder) {
        setOrder({ ...updatedOrder, status: "delivered", workflowStatus: "DELIVERED" });
      } else {
        setOrder((prev) => prev ? { ...prev, status: "delivered", workflowStatus: "DELIVERED" } : prev);
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
      toast.success("✅ Order delivered successfully!");
    }
  };

  const handleOtpValidationError = (error) => {
    console.error("OTP validation error:", error);
  };

  const handleAcceptReturn = async () => {
    try {
      setAccepting(true);
      const res = await deliveryApi.acceptReturnPickup(order.orderId);
      const updated = res.data.result;
      setOrder(updated);
      toast.success("Return pickup task accepted!");
      setStep(1);
    } catch (error) {
      console.error("Failed to accept return pickup", error);
      toast.error(error.response?.data?.message || "Failed to accept task");
    } finally {
      setAccepting(false);
    }
  };

  // Check if current rider is assigned to this return
  const isAssignedRider = useMemo(() => {
    if (!order || !user) return false;
    if (!isReturn) return true; // Standard orders are handled differently/already assigned to someone

    const returnRiderId = order.returnDeliveryBoy?._id || order.returnDeliveryBoy;
    return String(returnRiderId) === String(user._id);
  }, [order, user, isReturn]);

  const isReturnWaitAccept = useMemo(() => {
    if (!order) return false;
    const isReturn = order.returnStatus && order.returnStatus !== "none";
    return isReturn && !order.returnDeliveryBoy;
  }, [order]);

  // Determine current phase for map
  // Return: steps 1-2 = navigate to customer (pickup), steps 3-4 = navigate to seller (delivery)
  const currentPhase = isReturn ? (step <= 2 ? "pickup" : "delivery") : step <= 2 ? "pickup" : "delivery";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  if (!order) return null;

  const orderShortId =
    typeof order.orderId === "string" ? order.orderId.slice(-8) : order.orderId;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-28 font-['Poppins',_sans-serif]">
      {/* Header */}
      <div className="bg-white/85 backdrop-blur-md sticky top-0 z-30 px-4 py-3 flex items-center justify-between border-b border-slate-100">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="mr-2"
          >
            <ChevronDown className="rotate-90 text-slate-800" size={24} />
          </Button>
          <h1 className="text-base font-bold text-slate-800">Order #{orderShortId}</h1>
        </div>
        <div className="flex flex-col items-end">
          <span
            className={`text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wide ${publicStatusStage === 1
                ? "bg-brand-100 text-brand-700"
                : publicStatusStage === 2
                  ? "bg-amber-100 text-amber-700"
                  : "bg-brand-100 text-brand-700"
              }`}
          >
            {isReturn ? (
              publicStatusStage === 1 ? "Return Assigned" :
                publicStatusStage === 2 ? "Out for Pickup" :
                  "Return Received"
            ) : (
              publicStatusStage === 1 ? "Confirmed" :
                publicStatusStage === 2 ? "Out for Delivery" :
                  "Delivered"
            )}
          </span>
          {(order.payment?.method?.toLowerCase() === "cash" ||
            order.payment?.method?.toLowerCase() === "cod") &&
            !isReturn &&
            step < 4 && (
              <span className={`mt-1 text-white text-[10px] font-black px-2 py-0.5 rounded shadow-sm animate-pulse bg-orange-600`}>
                COLLECT CASH: ₹{Math.max(0, (order.pricing?.total || 0) - (order.pricing?.walletAmount || 0))}
              </span>
            )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Acceptance Guard for Returns */}
        <AnimatePresence>
          {isReturnWaitAccept && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="bg-white rounded-[32px] p-6 text-slate-900 shadow-xl border border-brand-100 relative overflow-hidden mb-6"
            >
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-brand-50 rounded-full blur-3xl" />
              <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-brand-50 rounded-full blur-3xl" />

              <div className="relative z-10 flex flex-col items-center text-center space-y-6">
                <div className="w-16 h-16 bg-brand-100 text-brand-600 rounded-2xl flex items-center justify-center">
                  <Package size={32} />
                </div>
                <div>
                  <h2 className="text-2xl font-black mb-1 uppercase tracking-tight text-slate-900">
                    New Return Task
                  </h2>
                  <p className="text-slate-500 text-sm font-medium leading-relaxed">
                    Pick up product from customer and deliver back to seller.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 w-full pt-2">
                  <div className="bg-brand-50 rounded-2xl p-4 border border-brand-100">
                    <p className="text-[10px] uppercase font-bold text-brand-600 mb-1">
                      Earnings
                    </p>
                    <p className="text-xl font-black text-brand-900">
                      ₹{order.returnDeliveryCommission || 0}
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">
                      Distance
                    </p>
                    <p className="text-xl font-black text-slate-900">
                      {summary.totalDistanceText}
                    </p>
                  </div>
                </div>

                {/* Product Detail List */}
                <div className="w-full space-y-3 pt-2">
                  <p className="text-[10px] uppercase font-bold text-slate-400 text-left px-1">
                    Items to pick up
                  </p>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1 text-left">
                    {(order.returnItems || order.items)?.map((item, i) => (
                      <div key={i} className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
                        <div className="h-12 w-12 rounded-xl bg-slate-50 overflow-hidden flex-shrink-0 border border-slate-100 flex items-center justify-center">
                          {item.image || item.product?.mainImage ? (
                            <img
                              src={item.image || item.product?.mainImage}
                              alt={item.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Package className="h-6 w-6 text-slate-300" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">{item.name}</p>
                          <p className="text-[10px] font-bold text-slate-500">Qty: {item.quantity}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {order.returnReason && (
                    <div className="bg-orange-50 rounded-2xl p-4 border border-orange-100 text-left">
                      <p className="text-[10px] uppercase font-bold text-orange-600 mb-1">Reason for return</p>
                      <p className="text-sm font-bold text-slate-800 leading-relaxed line-clamp-2">{order.returnReason}</p>
                      {order.returnReasonDetail && (
                        <p className="text-[11px] text-slate-600 font-medium italic mt-1 line-clamp-2">"{order.returnReasonDetail}"</p>
                      )}

                      {order.returnImages?.length > 0 && (
                        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                          {order.returnImages.map((img, idx) => (
                            <img key={idx} src={img} alt={`Return Proof ${idx}`} className="w-12 h-12 rounded-xl object-cover border border-orange-200 shrink-0" />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="w-full pt-4">
                  <Button
                    loading={accepting}
                    onClick={handleAcceptReturn}
                    className="w-full bg-slate-900 text-white hover:bg-black h-14 rounded-2xl font-black text-lg shadow-lg"
                  >
                    ACCEPT RETURN TASK
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {isReturn && order.returnDeliveryBoy && !isAssignedRider && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-red-50 rounded-2xl p-4 border border-red-100 flex items-center text-red-700 mb-6"
            >
              <AlertTriangle className="mr-3" size={20} />
              <p className="font-bold text-sm">
                This task has been accepted by another partner.
              </p>
            </motion.div>
          )}
        </AnimatePresence>


        {/* Map Section - Hidden when completed */}
        {(isReturn ? step < 5 : step < 4) && (!isReturn || isAssignedRider) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl overflow-hidden shadow-lg border border-slate-200/50 bg-white"
          >
            <div className="h-[340px] sm:h-[420px]">
              <DeliveryTrackingMap
                orderId={orderId}
                phase={currentPhase}
                order={order}
                onRouteStatsChange={setRouteStats}
              />
            </div>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#FFF8E8] rounded-3xl p-4 shadow-sm border border-[#F4D98B] flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 bg-[#F6E7BF] rounded-xl flex items-center justify-center text-[#C87400]">
              <Navigation size={20} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#C85D00] uppercase tracking-wider">
                Estimated Time
              </p>
              <p className="text-xl font-black text-[#8B3F00] leading-none">
                {summary.arrivalTimeText}
              </p>
            </div>
          </div>
          <div className="text-right flex flex-col items-end gap-2">
            <div>
              <p className="text-[11px] font-bold text-[#C85D00] uppercase tracking-wider">
                Arriving in
              </p>
              <p className="text-xl font-black text-[#8B3F00] leading-none">
                {summary.arrivingInText}
              </p>
            </div>
            <div className="inline-flex items-center rounded-full bg-white/80 px-3 py-1.5 text-[11px] font-bold text-[#C87400] ring-1 ring-[#F4D98B]">
              Total distance: {summary.totalDistanceText}
            </div>
          </div>
        </motion.div>

        <Card className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          <div className="flex justify-between items-center px-2 mb-2 relative">
            <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-100 -z-10 rounded-full" />
            <motion.div
              className="absolute top-1/2 left-0 h-1 bg-brand-500 -z-10 rounded-full"
              initial={{ width: "0%" }}
              animate={{
                width: `${((publicStatusStage - 1) / ((isReturn ? RETURN_PUBLIC_STATUS_STEPS : PUBLIC_STATUS_STEPS).length - 1)) * 100}%`,
              }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
            />
            {(isReturn ? RETURN_PUBLIC_STATUS_STEPS : PUBLIC_STATUS_STEPS).map(({ id, label }) => (
              <motion.div
                key={id}
                initial={false}
                animate={{
                  scale: id === publicStatusStage ? 1.15 : 1,
                  backgroundColor: id <= publicStatusStage ? "var(--primary)" : "#ffffff",
                  borderColor: id <= publicStatusStage ? "var(--primary)" : "#e5e7eb",
                  color: id <= publicStatusStage ? "#ffffff" : "#9ca3af",
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 z-10 shadow-sm"
                aria-label={label}
              >
                {id < publicStatusStage ? <CheckCircle size={16} /> : id}
              </motion.div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs text-slate-500 font-medium px-1">
            {(isReturn ? RETURN_PUBLIC_STATUS_STEPS : PUBLIC_STATUS_STEPS).map(({ id, label }) => (
              <span key={id} className="text-center">
                {label}
              </span>
            ))}
          </div>
        </Card>

        <AnimatePresence mode="wait">
          {/* Customer pickup card: show at return steps 1-2, standard delivery steps 1-2 */}
          {(isReturn ? (step === 1 || step === 2) : step <= 2) && (
            <motion.div
              key="pickup"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, height: 0 }}
            >
              <Card className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-orange-50/50 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="p-2 bg-white rounded-full shadow-sm mr-3 overflow-hidden">
                      {isReturn ? (
                        <User className="text-orange-600" size={20} />
                      ) : (
                        order.seller?.shopImage ? (
                          <div className="h-6 w-6 rounded-full overflow-hidden -m-1">
                             <img src={order.seller.shopImage} alt={order.seller.shopName} className="h-full w-full object-cover" />
                          </div>
                        ) : (
                          <Store className="text-orange-600" size={20} />
                        )
                      )}
                    </div>
                    <div>
                      <h2 className="font-bold text-gray-800">
                        {isReturn ? "Customer Pickup" : "Pickup Location"}
                      </h2>
                      <p className="text-xs text-orange-600 font-medium">
                        {isReturn ? "Customer Address" : "Store Location"}
                      </p>
                    </div>
                  </div>
                  {(isReturn ? order.address?.phone : order.seller?.phone) && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() =>
                        (window.location.href = `tel:${isReturn ? order.address?.phone : order.seller?.phone}`)
                      }
                    >
                      <Phone size={18} />
                    </Button>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-lg mb-1">
                    {isReturn
                      ? order.address?.name || "Customer"
                      : order.seller?.shopName || "Seller Store"}
                  </h3>
                  <p className="text-gray-500 text-sm mb-4 leading-relaxed">
                    {isReturn
                      ? order.address?.address || "Address not available"
                      : order.seller?.address || "Address not available"}
                  </p>
                  <Button onClick={handleNavigate} className="w-full bg-slate-900 text-white hover:bg-black rounded-2xl h-12 shadow-md border-none font-bold">
                    <Navigation size={18} className="mr-2" />{" "}
                    {isReturn ? "Navigate to Customer" : "Navigate to Store"}
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {/* Seller card: return steps 3-4, standard delivery steps 3-4 */}
          {(isReturn ? (step === 3 || step === 4) : step >= 3) && step < (isReturn ? 5 : 5) && (
            <motion.div
              key="customer"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              <Card className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-brand-50/50 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="p-2 bg-white rounded-full shadow-sm mr-3 overflow-hidden">
                      {isReturn ? (
                        order.seller?.shopImage ? (
                          <div className="h-6 w-6 rounded-full overflow-hidden -m-1">
                             <img src={order.seller.shopImage} alt={order.seller.shopName} className="h-full w-full object-cover" />
                          </div>
                        ) : (
                          <Store className="text-brand-600" size={20} />
                        )
                      ) : (
                        <User className="text-brand-600" size={20} />
                      )}
                    </div>
                    <div>
                      <h2 className="font-bold text-gray-800">
                        {isReturn ? "Return Drop" : "Customer Details"}
                      </h2>
                      <div className="flex items-center space-x-2 mt-0.5">
                        <p
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${order.payment?.method?.toLowerCase() === "cash" ||
                              order.payment?.method?.toLowerCase() === "cod"
                              ? "bg-orange-50 text-orange-700 border-orange-200"
                              : "bg-brand-50 text-brand-700 border-brand-200"
                            }`}
                        >
                          {order.payment?.method?.toUpperCase() || "PENDING"}
                        </p>
                        <p className="text-[10px] text-gray-400 font-medium">Bill: Rs.{order.pricing?.total}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-9 w-9"
                      onClick={() => setShowChatModal(true)}
                    >
                      <MessageSquare size={18} />
                    </Button>
                    {(isReturn ? order.seller?.phone : order.address?.phone) && (
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() =>
                          (window.location.href = `tel:${isReturn ? order.seller?.phone : order.address?.phone}`)
                        }
                      >
                        <Phone size={18} />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-lg mb-1">
                    {isReturn
                      ? order.seller?.shopName || "Seller Store"
                      : order.address?.name || "Customer"}
                  </h3>
                  <p className="text-gray-500 text-sm mb-1">
                    {isReturn ? order.seller?.address : order.address?.address}
                  </p>
                  <p className="text-gray-500 text-sm mb-4">
                    {isReturn ? order.seller?.address : order.address?.city}
                  </p>
                  <Button onClick={handleNavigate} className="w-full bg-black  hover:bg-brand-700 text-primary-foreground border-none">
                    <Navigation size={18} className="mr-2" />{" "}
                    {isReturn ? "Navigate to Seller" : "Navigate to Customer"}
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <Card className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <motion.div
            className="p-5 flex justify-between items-center cursor-pointer hover:bg-slate-50 transition-colors"
            onClick={() => setItemsExpanded(!itemsExpanded)}
          >
            <div className="flex items-center font-bold text-slate-800">
              <div className="p-2.5 bg-brand-50 text-brand-600 rounded-xl mr-4 shadow-inner">
                <Package size={20} />
              </div>
              <div>
                <span className="text-base font-black">Order Items</span>
                <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                  {order.items?.length || 0} items
                </span>
              </div>
            </div>
            <motion.div animate={{ rotate: itemsExpanded ? 180 : 0 }} transition={{ duration: 0.3 }}>
              <ChevronDown size={20} className="text-slate-400" />
            </motion.div>
          </motion.div>

          <AnimatePresence>
            {itemsExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="p-5 border-t border-slate-100 bg-slate-50/50 space-y-4">
                  {(isReturn ? order.returnItems : order.items)?.map((item, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <span className="font-black text-slate-500 text-[10px] uppercase bg-white border border-slate-200 w-8 h-8 flex items-center justify-center rounded-xl shadow-sm">
                          x{item.quantity}
                        </span>
                        <span className="text-slate-800 font-bold text-sm">{item.name}</span>
                      </div>
                      <span className="font-black text-slate-900 text-sm">₹{item.price * item.quantity}</span>
                    </div>
                  ))}
                  <div className="pt-4 mt-2 border-t border-slate-200 border-dashed flex justify-between items-center">
                    <span className="text-slate-500 font-bold text-[11px] uppercase tracking-widest">Total Bill</span>
                    <span className="text-xl font-black text-slate-900">₹{order.pricing?.total}</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        {order?.deliveryInstruction && (
          <motion.div
            className="bg-orange-50 rounded-2xl p-4 border border-orange-200 flex items-start shadow-sm"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <AlertTriangle className="text-orange-600 mr-3 mt-0.5 flex-shrink-0" size={18} />
            <p className="text-sm text-orange-800 font-medium leading-relaxed">
              <strong className="font-bold uppercase tracking-wide text-xs">Note:</strong> {order.deliveryInstruction}
            </p>
          </motion.div>
        )}

        {/* Return Step 2: Upload proof then request customer pickup OTP */}
        {isReturn && step === 2 && !showOtpInput && isAssignedRider && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            {!pickupProofSubmitted ? (
              <ReturnPickupProofUpload
                orderId={orderId}
                onSubmitted={() => setPickupProofSubmitted(true)}
              />
            ) : (
              <Card className="p-6 rounded-3xl shadow-sm border border-slate-100">
                <div className="flex items-center mb-4 text-gray-800">
                  <ShieldCheck className="mr-2 text-primary" size={24} />
                  <h3 className="font-bold text-lg">Request Pickup OTP</h3>
                </div>
                <p className="text-gray-500 text-sm mb-4">
                  Proof uploaded ✅. Slide to send OTP to customer.
                </p>
                <DeliverySlideButton
                  orderId={orderId}
                  onSuccess={handleOtpGenerated}
                  onError={handleOtpGenerationError}
                  isReturn={true}
                  bgColor="bg-orange-500"
                  bgColorLight="bg-orange-50"
                  label="SLIDE TO SEND CUSTOMER OTP"
                />
              </Card>
            )}
          </motion.div>
        )}

        {/* Normal delivery Step 2: Bag scan at pickup store */}
        {!isReturn && step === 2 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            {!bagPickupScanDone && (
              <Card className="p-5 rounded-3xl shadow-sm border border-indigo-100 mb-3">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-indigo-100 rounded-2xl">
                    <QrCode size={20} className="text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800">Scan Bag at Pickup</h3>
                    <p className="text-xs text-gray-500">Scan the bag QR before picking up</p>
                  </div>
                </div>

                {!pickupScannerOpen ? (
                  <button
                    onClick={() => setPickupScannerOpen(true)}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl py-3 font-bold text-sm"
                  >
                    <ScanLine size={16} />
                    SCAN BAG QR
                  </button>
                ) : (
                  <QRScanner
                    title="Pickup Scan"
                    hint="Scan the QR code on the paper bag"
                    onScan={async (bagId) => {
                      setPickupScannerOpen(false);
                      try {
                        await deliveryApi.scanBagAtPickup(orderId, bagId);
                        setBagPickupScanDone(true);
                        toast.success(`Bag ${bagId} scanned at pickup ✅`);
                      } catch (err) {
                        const msg = err?.response?.data?.message || 'Bag scan failed';
                        toast.error(msg);
                        if (err?.response?.status !== 409) setPickupScannerOpen(true);
                      }
                    }}
                    onDuplicate={(bagId) => toast.error(`Bag ${bagId} already scanned!`)}
                    onClose={() => setPickupScannerOpen(false)}
                    allowManual
                  />
                )}

                <button
                  onClick={() => setBagPickupScanDone(true)}
                  className="mt-3 w-full text-xs text-gray-400 hover:text-gray-600 font-medium py-1"
                >
                  Skip bag scan (damaged QR)
                </button>
              </Card>
            )}
          </motion.div>
        )}

        {/* Normal delivery Step 3: generate OTP for customer */}
        {!isReturn && step === 3 && !showOtpInput && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>

            {/* ── Bag scan at delivery door ─── */}
            {!bagDeliveryScanDone && (
              <Card className="p-5 rounded-3xl shadow-sm border border-indigo-100 mb-3">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-indigo-100 rounded-2xl">
                    <QrCode size={20} className="text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800">Scan Bag at Door</h3>
                    <p className="text-xs text-gray-500">Scan the bag QR before ringing the doorbell</p>
                  </div>
                </div>

                {!deliveryScannerOpen ? (
                  <button
                    onClick={() => setDeliveryScannerOpen(true)}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl py-3 font-bold text-sm"
                  >
                    <ScanLine size={16} />
                    SCAN BAG QR
                  </button>
                ) : (
                  <QRScanner
                    title="Delivery Scan"
                    hint="Scan the QR code on the paper bag"
                    onScan={async (bagId) => {
                      setDeliveryScannerOpen(false);
                      try {
                        const res = await deliveryApi.scanBagAtDelivery(orderId, bagId);
                        if (res.data?.result?.order) {
                          setOrder(res.data.result.order);
                        }
                        setShowVerificationModal(true);
                        toast.success(`Bag ${bagId} scanned at delivery ✅`);
                      } catch (err) {
                        const msg = err?.response?.data?.message || 'Bag scan failed';
                        toast.error(msg);
                        if (err?.response?.status !== 409) setDeliveryScannerOpen(true);
                      }
                    }}
                    onDuplicate={(bagId) => toast.error(`Bag ${bagId} already scanned!`)}
                    onClose={() => setDeliveryScannerOpen(false)}
                    allowManual
                  />
                )}

                <button
                  onClick={() => setShowVerificationModal(true)}
                  className="mt-3 w-full text-xs text-gray-400 hover:text-gray-600 font-medium py-1"
                >
                  Skip bag scan (damaged QR)
                </button>
              </Card>
            )}

            {bagDeliveryScanDone && (
              <Card className="p-6 rounded-3xl shadow-sm border border-slate-100">
                <div className="flex items-center mb-4 text-gray-800">
                  <ShieldCheck className="mr-2 text-primary" size={24} />
                  <h3 className="font-bold text-lg">Generate Delivery OTP</h3>
                </div>
                <p className="text-gray-500 text-sm mb-4">
                  Slide to generate OTP for the customer.
                </p>
                <DeliverySlideButton
                  orderId={orderId}
                  onSuccess={handleOtpGenerated}
                  onError={handleOtpGenerationError}
                  isReturn={false}
                />
              </Card>
            )}
          </motion.div>
        )}

        {/* Return Step 4: arrived at seller — request seller drop OTP */}
        {isReturn && step === 4 && !showDropOtpInput && isAssignedRider && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="p-6 rounded-3xl shadow-sm border border-green-100">
              <div className="flex items-center mb-4 text-gray-800">
                <ShieldCheck className="mr-2 text-green-600" size={24} />
                <h3 className="font-bold text-lg">Request Seller OTP</h3>
              </div>
              <p className="text-gray-500 text-sm mb-4">
                Slide to send OTP to seller (via app + SMS). Seller will share it with you.
              </p>
              <DeliverySlideButton
                orderId={orderId}
                isReturn={false}
                isReturnDrop={true}
                bgColor="bg-green-600"
                bgColorLight="bg-green-50"
                label="SLIDE TO SEND SELLER OTP"
                onSuccess={() => {
                  setShowDropOtpInput(true);
                  toast.success("OTP sent to seller!");
                }}
                onError={(err) => toast.error(err?.message || "Failed to send seller OTP")}
              />
            </Card>
          </motion.div>
        )}

        {/* Pickup OTP input */}
        {showOtpInput && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="p-6 rounded-3xl shadow-sm border border-slate-100">
              <OtpInput
                orderId={orderId}
                isReturn={isReturn}
                isReturnDrop={false}
                onSuccess={handleOtpValidationSuccess}
                onError={handleOtpValidationError}
                onCancel={() => setShowOtpInput(false)}
              />
            </Card>
          </motion.div>
        )}

        {/* Seller drop OTP input */}
        {isReturn && showDropOtpInput && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="p-6 rounded-3xl shadow-sm border border-green-100">
              <OtpInput
                orderId={orderId}
                isReturn={false}
                isReturnDrop={true}
                onSuccess={(data) => {
                  const updatedOrder = data?.result || data?.data?.result;
                  if (updatedOrder) setOrder(updatedOrder);
                  setStep(5);
                  toast.success("✅ Return complete! Commission credited to your wallet.");
                  setTimeout(() => navigate("/delivery/dashboard"), 1800);
                }}
                onError={handleOtpValidationError}
                onCancel={() => setShowDropOtpInput(false)}
              />
            </Card>
          </motion.div>
        )}

      </div>

      {/* Slide button: for returns shown at steps 1 and 3 (navigation steps); for standard shown at steps 1-2 */}
      {((isReturn && (step === 1 || step === 3) && isAssignedRider) || (!isReturn && step === 1) || (!isReturn && step === 2 && bagPickupScanDone)) && (
        <div className="fixed bottom-[68px] lg:bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.1)]">
          <div className="max-w-2xl mx-auto p-4">
            <div className="relative h-16 bg-slate-100 rounded-full overflow-hidden select-none">
              <motion.div
                className={`absolute inset-0 flex items-center justify-center text-slate-400 font-bold text-lg pointer-events-none transition-opacity duration-300 ${dragX > 50 ? "opacity-0" : "opacity-100"
                  }`}
                animate={{ x: [0, 5, 0] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              >
                Slide to {
                  isReturn
                    ? step === 1 ? "ARRIVED AT CUSTOMER"
                      : step === 3 ? "ARRIVED AT SELLER"
                        : steps[step - 1]?.action
                    : steps[step - 1]?.action
                } <ChevronRight className="ml-1" />
              </motion.div>

              <motion.div
                className={`absolute inset-y-0 left-0 ${steps[step - 1].bg} opacity-50`}
                style={{ width: dragX + 60 }}
              />

              <motion.div
                className={`absolute top-1 bottom-1 left-1 w-14 rounded-full flex items-center justify-center shadow-md cursor-grab active:cursor-grabbing z-20 ${steps[step - 1].color || "bg-primary"
                  }`}
                drag="x"
                dragConstraints={{ left: 0, right: 280 }}
                dragElastic={0.05}
                dragMomentum={false}
                onDrag={(event, info) => {
                  setDragX(info.point.x);
                }}
                onDragEnd={(event, info) => {
                  if (info.offset.x > 150) {
                    setIsSlideComplete(true);
                    handleNextStep();
                  } else {
                    setDragX(0);
                  }
                }}
                animate={{ x: isSlideComplete ? 280 : 0 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <ChevronRight className="text-white" size={24} />
              </motion.div>
            </div>
          </div>
        </div>
      )}

      <DeliveryOrderChatModal
        isOpen={showChatModal}
        onClose={() => setShowChatModal(false)}
        orderId={order?.orderId}
        customerName={order?.address?.name}
      />

      <DeliveryVerificationModal
        isOpen={showVerificationModal}
        order={order}
        onClose={() => setShowVerificationModal(false)}
        onVerify={() => {
          setShowVerificationModal(false);
          setBagDeliveryScanDone(true);
        }}
      />
    </div>
  );
};

export default OrderDetails;
