import React, { useState, useEffect, useRef } from "react";
import { motion, useMotionValue, useTransform, useAnimation } from "framer-motion";
import { ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { deliveryApi } from "../services/deliveryApi";

/**
 * DeliverySlideButton - A slide-to-confirm button for delivery actions
 * 
 * Rewritten for buttery smooth 60fps performance using framer-motion 
 * motion values to prevent React re-renders during dragging.
 */
const DeliverySlideButton = ({
  orderId,
  onSuccess,
  onError,
  isReturn = false,
  isReturnDrop = false,
  label = "SLIDE TO GENERATE OTP",
  bgColor = "bg-black ",
  bgColorLight = "bg-brand-50",
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 340, maxDrag: 280 });
  const controls = useAnimation();
  
  // Motion values for smooth 60fps animations without React re-renders
  const x = useMotionValue(0);
  const progressWidth = useTransform(x, [0, dimensions.maxDrag], [64, dimensions.width]);
  const textOpacity = useTransform(x, [0, dimensions.maxDrag * 0.3], [1, 0]);

  // Dynamically measure container width for responsive sliding
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth;
        setDimensions({ 
          width, 
          maxDrag: Math.max(0, width - 64) // w-14 (56px) + 8px padding
        });
      }
    };
    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  const resetSlide = () => {
    controls.start({ x: 0, transition: { type: "spring", stiffness: 300, damping: 25 } });
    setIsLoading(false);
  };

  // Reset slide state when orderId changes
  useEffect(() => {
    resetSlide();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  /**
   * Handle slide completion - generate OTP using stored location
   */
  const handleSlideComplete = async () => {
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

      resetSlide();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div ref={containerRef} className="relative h-16 bg-gray-100 rounded-full overflow-hidden select-none">
      {/* Progress background (Driven purely by motion value, 0 re-renders!) */}
      <motion.div
        className={`absolute inset-y-0 left-0 ${bgColorLight} opacity-50`}
        style={{ width: progressWidth }}
      />

      {/* Label text */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center text-gray-400 font-bold text-[13px] sm:text-sm pointer-events-none"
        style={{ opacity: isLoading ? 0 : textOpacity }}
      >
        <motion.div 
          animate={{ x: [0, 5, 0] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="flex items-center"
        >
          {label} <ChevronRight className="ml-1" size={16} />
        </motion.div>
      </motion.div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="animate-spin text-primary" size={24} />
          <span className="ml-2 text-sm font-medium text-gray-600">
            {isReturn ? "Requesting OTP..." : "Generating OTP..."}
          </span>
        </div>
      )}

      {/* Draggable button */}
      <motion.div
        className={`absolute top-1 bottom-1 left-1 w-14 rounded-full flex items-center justify-center shadow-md cursor-grab active:cursor-grabbing z-20 ${bgColor}`}
        style={{ x, pointerEvents: isLoading ? "none" : "auto" }}
        animate={controls}
        drag={!isLoading ? "x" : false}
        dragConstraints={{ left: 0, right: dimensions.maxDrag }}
        dragElastic={0.05}
        dragMomentum={false}
        onDragEnd={(e, info) => {
          if (isLoading) return;

          // If dragged more than 55% of the way, snap to end and trigger action
          if (info.offset.x > dimensions.maxDrag * 0.55) {
            controls.start({ x: dimensions.maxDrag, transition: { duration: 0.2 } });
            handleSlideComplete();
          } else {
            // Otherwise snap back to start
            controls.start({ x: 0, transition: { type: "spring", stiffness: 300, damping: 25 } });
          }
        }}
        whileHover={{ scale: isLoading ? 1 : 1.05 }}
        whileTap={{ scale: isLoading ? 1 : 0.95 }}
      >
        <ChevronRight className="text-white" size={24} />
      </motion.div>
    </div>
  );
};

export default DeliverySlideButton;
