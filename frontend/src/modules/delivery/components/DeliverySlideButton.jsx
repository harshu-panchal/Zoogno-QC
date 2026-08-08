import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { deliveryApi } from "../services/deliveryApi";

/**
 * DeliverySlideButton (now just a standard Button) - A button for delivery actions
 * 
 * Replaced slide-to-confirm logic with a simple, accessible action button 
 * to improve ease-of-use for delivery riders while retaining the exact same API.
 */
const DeliverySlideButton = ({
  orderId,
  onSuccess,
  onError,
  isReturn = false,
  isReturnDrop = false,
  label = "GENERATE OTP",
  bgColor = "bg-slate-900",
}) => {
  const [isLoading, setIsLoading] = useState(false);

  // Convert "SLIDE TO ACTION" -> "ACTION"
  const buttonLabel = label.replace(/^SLIDE TO /i, "");
  
  const parsedBgColor = bgColor.includes("bg-black") ? "bg-slate-900" : bgColor;

  /**
   * Handle button click - generate OTP using stored location
   */
  const handleActionComplete = async () => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      // Call appropriate endpoint based on flow type
      const response = isReturnDrop
        ? await deliveryApi.requestReturnDropOtp(orderId, {})
        : isReturn
          ? await deliveryApi.requestReturnOtp(orderId, {})
          : await deliveryApi.generateDeliveryOtp(orderId);

      // Handle success
      toast.success(response.data?.message || "OTP generated and sent to customer");

      if (onSuccess) {
        onSuccess(response.data);
      }
    } catch (error) {
      // Extract custom error payload from handleResponse's 'result' wrapper
      const errorPayload = error.response?.data?.result?.error;
      const errorMessage = errorPayload?.message || error.response?.data?.message || error.message || "Failed to generate OTP";
      const errorCode = errorPayload?.code;

      // Display user-friendly error messages
      if (errorCode === "PROXIMITY_OUT_OF_RANGE") {
        const details = errorPayload?.details;
        const distance = details?.currentDistance;
        const range = details?.requiredRange || "0-120m";

        toast.error(
          `You are too ${distance > 120 ? "far" : "close"}. You must be within ${range} of the delivery location.`,
          { duration: 5000 }
        );
      } else if (errorCode === "LOCATION_REQUIRED" || errorCode === "LOCATION_STALE") {
        toast.error(errorMessage || "Location data is not available. Please ensure location tracking is enabled.");
      } else if (errorCode === "ORDER_NOT_FOUND") {
        toast.error("Order not found. Please refresh and try again.");
      } else if (errorCode === "UNAUTHORIZED_DELIVERY") {
        toast.error("This order is not assigned to you.");
      } else {
        toast.error(errorMessage);
      }

      if (onError) {
        onError(error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleActionComplete}
      disabled={isLoading}
      className={`w-full h-16 rounded-[24px] font-black text-sm sm:text-base tracking-widest text-white shadow-xl flex items-center justify-center transition-all active:scale-95 disabled:opacity-70 disabled:active:scale-100 ${parsedBgColor}`}
    >
      {isLoading ? (
        <div className="flex items-center space-x-2">
          <Loader2 className="animate-spin text-white" size={24} />
          <span>{isReturn ? "REQUESTING OTP..." : "GENERATING OTP..."}</span>
        </div>
      ) : (
        <span>{buttonLabel}</span>
      )}
    </button>
  );
};

export default DeliverySlideButton;
