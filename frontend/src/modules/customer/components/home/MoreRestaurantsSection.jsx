import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

const RestaurantCard = ({ seller, onClick, rotateIndex = 0 }) => {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const rawRating = Number(seller?.ratingAverage || 0);
  const ratingText = rawRating > 0 ? rawRating.toFixed(1) : "4.0";
  const deliveryTime = seller?.deliveryTime || seller?.estimatedDeliveryTime || "10-15 mins";
  const distance = seller?.distanceKm ? `${seller.distanceKm} km` : "1.1 km";
  const categoryTag = seller?.category || "Street Food";
  const priceTag = "₹150 for one";
  const offerText = seller?.offerText || "Flat ₹125 OFF above ₹399";

  const taglineText = seller?.tagline || "Near & Fast";
  const deliveryInfoText = `${deliveryTime} | ${distance}`;
  const isDeliveryInfo = rotateIndex % 2 === 1;
  const currentText = isDeliveryInfo ? deliveryInfoText : taglineText;

  const isPureVeg = seller?.foodType === "PURE_VEG";
  const isNonVeg = seller?.foodType === "NON_VEG";
  const foodTypeLabel = isPureVeg
    ? "Pure Veg restaurant"
    : isNonVeg
    ? "Non-Veg restaurant"
    : "Pure Veg & Non-Veg";

  const fallbackImage =
    seller?.storefrontImage ||
    seller?.shopImage ||
    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=800";

  const rawImages = Array.isArray(seller?.images) && seller.images.length > 0
    ? seller.images
    : [fallbackImage];

  // Keep up to 4 images
  const images = rawImages.slice(0, 4);

  // Auto-rotate every 3.2 seconds if multiple images exist and not hovered
  useEffect(() => {
    if (images.length <= 1 || isHovered) return;

    const timer = setInterval(() => {
      setActiveImageIndex((prev) => (prev + 1) % images.length);
    }, 3200);

    return () => clearInterval(timer);
  }, [images.length, isHovered]);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group bg-white rounded-3xl border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] hover:shadow-md transition-all overflow-hidden cursor-pointer flex flex-col active:scale-[0.99]"
    >
      {/* 1. Media Section with Auto-Rotating Carousel (Horizontal Slide / Scroll) */}
      <div className="relative w-full aspect-[16/10] sm:aspect-[16/9] bg-slate-100 overflow-hidden select-none">
        {/* Horizontal Sliding Track */}
        <div
          className="flex w-full h-full transition-transform duration-600 ease-in-out"
          style={{ transform: `translateX(-${activeImageIndex * 100}%)` }}
        >
          {images.map((src, index) => (
            <div key={index} className="w-full h-full shrink-0 relative">
              <img
                loading="lazy"
                src={src}
                alt={`${seller?.shopName || "Restaurant"} dish ${index + 1}`}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                onError={(e) => {
                  e.currentTarget.src =
                    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=800";
                }}
              />
            </div>
          ))}
        </div>

        {/* Carousel Indicator Dots */}
        {images.length > 1 && (
          <div className="absolute bottom-2.5 right-3 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-sm pointer-events-auto">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveImageIndex(i);
                }}
                aria-label={`Show image ${i + 1}`}
                className={`transition-all duration-300 rounded-full h-1.5 ${
                  i === activeImageIndex
                    ? "w-4 bg-white shadow-xs"
                    : "w-1.5 bg-white/50 hover:bg-white/80"
                }`}
              />
            ))}
          </div>
        )}

        {/* Top-Left Dark Translucent Tag */}
        <div className="absolute top-2.5 left-2.5 z-10 bg-black/70 backdrop-blur-md text-white text-[11px] font-bold px-2.5 py-0.5 rounded-md shadow-sm pointer-events-none tracking-wide">
          <span>{categoryTag}</span>
          <span className="mx-1 opacity-60">•</span>
          <span>{priceTag}</span>
        </div>

        {/* Bottom-Left Blue FREE Delivery Banner */}
        <div className="absolute bottom-0 left-0 z-10 bg-gradient-to-r from-[#1d4ed8] via-[#2563eb] to-[#3b82f6] text-white text-[10px] sm:text-[11px] font-black uppercase tracking-wider px-3 py-1 rounded-tr-xl shadow-md pointer-events-none">
          FREE delivery
        </div>
      </div>

      {/* 2. Content Details Section */}
      <div className="p-3.5 sm:p-4 flex flex-col">
        {/* Row 1: Restaurant Name & Green Rating Badge */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base sm:text-lg font-black text-slate-900 truncate tracking-tight">
            {seller?.shopName}
          </h3>

          <span className="inline-flex items-center gap-1 rounded-lg bg-[#137538] px-2 py-0.5 text-xs font-black text-white shrink-0 shadow-xs">
            <span>{ratingText}</span>
            <svg viewBox="0 0 20 20" className="h-2.5 w-2.5 fill-white" aria-hidden="true">
              <path d="M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L10 14.9l-5.2 2.8 1-5.9L1.5 7.7l5.9-.8z" />
            </svg>
          </span>
        </div>

        {/* Row 2: Rotating Tagline / Delivery Time (matches Best Offers section) */}
        <div className="mt-1 flex items-center gap-1.5 text-xs sm:text-[13px] font-bold text-[#00a86b] h-5 overflow-hidden [perspective:500px]">
          <motion.div
            animate={{ rotate: rotateIndex * 360 }}
            transition={{ duration: 0.6, ease: "easeInOut" }}
            className="shrink-0 flex items-center justify-center"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5 fill-[#00a86b] text-[#00a86b] shrink-0"
              aria-hidden="true"
            >
              <path d="M13 2L3 14h8l-1 8 11-13h-8l1-7z" />
            </svg>
          </motion.div>
          <AnimatePresence mode="wait">
            <motion.span
              key={isDeliveryInfo ? "delivery" : "tagline"}
              initial={{ rotateX: 360, opacity: 0 }}
              animate={{ rotateX: 0, opacity: 1 }}
              exit={{ rotateX: -360, opacity: 0 }}
              transition={{ duration: 0.6, ease: "easeInOut" }}
              style={{ display: "inline-block", transformOrigin: "center center" }}
              className="truncate"
            >
              {currentText}
            </motion.span>
          </AnimatePresence>
        </div>

        {/* Row 3: Blue Discount Rosette + Flat/Percent Offer */}
        {offerText && (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-700">
            {/* 8-point Blue Rosette Discount Badge */}
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4 text-blue-600 fill-blue-600 shrink-0"
              aria-hidden="true"
            >
              <path d="M12 2l2.4 2.4 3.4-.6 1.4 3.1 3.2 1.3-.3 3.4 2.2 2.6-1.8 3 .9 3.3-3.1 1.4-1.3 3.2-3.4-.3-2.6 2.2-3-1.8-3.3.9-1.4-3.1-3.2-1.3.3-3.4-2.2-2.6 1.8-3-.9-3.3 3.1-1.4 1.3-3.2 3.4.3L12 2z" />
              <path
                d="M9.5 9.5l5 5m-5 0l5-5"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            <span className="truncate">{offerText}</span>
          </div>
        )}

        {/* Dotted Divider */}
        <div className="border-t border-dashed border-slate-200 mt-2.5 pt-2.5" />

        {/* Row 4: Food Type Pill with Leaf Icon */}
        <div className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 self-start">
          <svg
            viewBox="0 0 24 24"
            className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600 shrink-0"
            aria-hidden="true"
          >
            <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 008 20C19 20 22 3 22 3c-1 2-8 2-11 5-4 4-2 9-2 9s6-1 9-5c1-1.33 1.67-2.67 2-4z" />
          </svg>
          <span>{foodTypeLabel}</span>
        </div>
      </div>
    </div>
  );
};

const MoreRestaurantsSection = ({ sellers }) => {
  const navigate = useNavigate();
  const [rotateIndex, setRotateIndex] = useState(0);

  // Auto-rotate tagline & delivery time every 3 seconds (exact same timer as BestOffersSection)
  useEffect(() => {
    if (!sellers || !sellers.length) return undefined;
    const interval = setInterval(() => {
      setRotateIndex((prev) => (prev + 1) % 2);
    }, 3000);
    return () => clearInterval(interval);
  }, [sellers?.length]);

  if (!sellers || sellers.length === 0) return null;

  return (
    <section className="mb-8 px-4 sm:px-6">
      <div className="mb-3.5">
        <h2 className="text-sm sm:text-base font-normal tracking-[0.02em] text-[#7d8597]">
          More restaurants
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {sellers.map((seller) => (
          <RestaurantCard
            key={seller._id || seller.id}
            seller={seller}
            rotateIndex={rotateIndex}
            onClick={() => navigate(`/store/${seller._id || seller.id}`)}
          />
        ))}
      </div>
    </section>
  );
};

export default MoreRestaurantsSection;
