import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "../../context/LocationContext";
import { bestOffersApi } from "../../services/bestOffersApi";

const hasUsableLocation = (loc) => {
  const lat = Number(loc?.latitude);
  const lng = Number(loc?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
};

// 12-lobed soft lavender scalloped sticker matching screenshot
const PercentBadge = () => (
  <svg
    viewBox="0 0 100 100"
    className="h-12 w-12 sm:h-14 sm:w-14 shrink-0 drop-shadow-[0_4px_12px_rgba(167,139,250,0.35)]"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="scallop-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#d3bcfc" />
        <stop offset="100%" stopColor="#b293f7" />
      </linearGradient>
    </defs>
    {/* 12-petal scalloped rosette sticker */}
    <g fill="url(#scallop-grad)">
      <circle cx="50" cy="50" r="36" />
      <circle cx="84" cy="50" r="14" />
      <circle cx="79.44" cy="67" r="14" />
      <circle cx="67" cy="79.44" r="14" />
      <circle cx="50" cy="84" r="14" />
      <circle cx="33" cy="79.44" r="14" />
      <circle cx="20.56" cy="67" r="14" />
      <circle cx="16" cy="50" r="14" />
      <circle cx="20.56" cy="33" r="14" />
      <circle cx="33" cy="20.56" r="14" />
      <circle cx="50" cy="16" r="14" />
      <circle cx="67" cy="20.56" r="14" />
      <circle cx="79.44" cy="33" r="14" />
    </g>
    {/* White Percent symbol with hollow rings and diagonal stroke */}
    <g stroke="#ffffff" strokeWidth="6" strokeLinecap="round" fill="none">
      <line x1="64" y1="34" x2="36" y2="66" />
      <circle cx="38" cy="38" r="5" strokeWidth="4.5" />
      <circle cx="62" cy="62" r="5" strokeWidth="4.5" />
    </g>
  </svg>
);

const Card = ({ item, onClick, rotateIndex }) => {
  const hasRealRating = item.rating != null && Number(item.rating) > 0;
  const ratingValue = hasRealRating ? Number(item.rating).toFixed(1) : null;
  const taglineText = item.tagline || "Near & Fast";
  const deliveryTimeText = item.deliveryTime || "8-15 mins";

  // Alternate every 3s: rotateIndex 0 = "Near & Fast", rotateIndex 1 = Delivery Time (e.g. "12-18 mins")
  const isDeliveryTime = rotateIndex % 2 === 1;
  const currentText = isDeliveryTime ? deliveryTimeText : taglineText;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-[136px] sm:w-[155px] md:w-[165px] text-left active:scale-[0.98] transition-transform flex flex-col group"
    >
      {/* Media container holding the photo and rating badge */}
      <div className="relative w-full aspect-[4/3] select-none">
        {/* Photo container: uses scooped notch when real rating exists, otherwise clean rounded-2xl */}
        <div
          style={
            hasRealRating
              ? {
                  clipPath: "url(#bestOfferNotchClip)",
                  WebkitClipPath: "url(#bestOfferNotchClip)",
                }
              : undefined
          }
          className={`w-full h-full bg-slate-100 overflow-hidden ${hasRealRating ? "" : "rounded-2xl ring-1 ring-slate-200/60 shadow-sm"}`}
        >
          <img
            loading="lazy"
            src={item.image}
            alt={item.shopName}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>

        {/* Top-Left Purple Offer Tag */}
        {item.offerText && (
          <span className="absolute left-2 top-2 z-10 max-w-[calc(100%-1rem)] rounded-md bg-[#5d3ebd] px-2 py-0.5 text-[11px] sm:text-xs font-bold leading-tight text-white line-clamp-2 shadow-sm pointer-events-none">
            {item.offerText}
          </span>
        )}

        {/* Bottom-Left Green Rating Badge: ONLY shown when seller has REAL rating */}
        {hasRealRating && (
          <div className="absolute left-0 bottom-0 z-10 flex items-center pointer-events-none">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#137538] px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
              <span>{ratingValue}</span>
              <svg viewBox="0 0 20 20" className="h-2.5 w-2.5 fill-white" aria-hidden="true">
                <path d="M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L10 14.9l-5.2 2.8 1-5.9L1.5 7.7l5.9-.8z" />
              </svg>
            </span>
          </div>
        )}
      </div>

      {/* Info below media area */}
      <div className="mt-2.5 flex flex-col">
        {/* Shop Name */}
        <p className="truncate text-[14px] sm:text-[15px] font-bold text-[#1f2937] leading-tight">
          {item.shopName}
        </p>

        {/* Tagline / Near & Fast with full 360-degree rotation animation */}
        <div className="mt-1 flex items-center gap-1 text-[12px] sm:text-[13px] font-semibold text-[#00a86b] h-5 overflow-hidden [perspective:500px]">
          <motion.div
            animate={{ rotate: rotateIndex * 360 }}
            transition={{ duration: 0.6, ease: "easeInOut" }}
            className="shrink-0 flex items-center justify-center"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-[#00a86b] text-[#00a86b]" aria-hidden="true">
              <path d="M13 2L3 14h8l-1 8 11-13h-8l1-7z" />
            </svg>
          </motion.div>
          <AnimatePresence mode="wait">
            <motion.span
              key={isDeliveryTime ? "delivery" : "tagline"}
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
      </div>
    </button>
  );
};

const BestOffersSection = () => {
  const navigate = useNavigate();
  const { currentLocation, isLocationReady } = useLocation();
  const [items, setItems] = useState([]);
  const [rotateIndex, setRotateIndex] = useState(0);

  const lat = currentLocation?.latitude;
  const lng = currentLocation?.longitude;

  // Auto-rotate tagline & delivery time every 3 seconds
  useEffect(() => {
    if (!items.length) return undefined;
    const interval = setInterval(() => {
      setRotateIndex((prev) => (prev + 1) % 2);
    }, 3000);
    return () => clearInterval(interval);
  }, [items.length]);

  useEffect(() => {
    if (!isLocationReady || !hasUsableLocation(currentLocation)) {
      setItems([]);
      return undefined;
    }
    let active = true;
    bestOffersApi
      .getBestOffers({ lat, lng })
      .then((res) => {
        if (!active) return;
        const list = res?.data?.result ?? res?.data?.results ?? [];
        setItems(Array.isArray(list) ? list : []);
      })
      .catch(() => active && setItems([]));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocationReady, lat, lng]);

  if (!items.length) return null;

  return (
    <section className="bg-white px-4 pt-4 pb-6">
      {/* SVG ClipPath Definition for the scooped card notch (objectBoundingBox scales to any card dimension) */}
      <svg width="0" height="0" className="absolute pointer-events-none" aria-hidden="true">
        <defs>
          <clipPath id="bestOfferNotchClip" clipPathUnits="objectBoundingBox">
            <path d="M 0,0.12 C 0,0.05 0.05,0 0.12,0 L 0.88,0 C 0.95,0 1,0.05 1,0.12 L 1,0.88 C 1,0.95 0.95,1 0.88,1 L 0.50,1 C 0.44,1 0.42,0.75 0.36,0.75 L 0.10,0.75 C 0.04,0.75 0,0.71 0,0.63 Z" />
          </clipPath>
        </defs>
      </svg>

      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[14px] sm:text-[15px] font-normal tracking-[0.02em] text-[#7d8597]">
            Top Restaurants with
          </p>
          <h2 className="text-[24px] sm:text-[28px] font-bold text-[#1f2438] leading-tight mt-0.5">
            Best Offers
          </h2>
        </div>
        <PercentBadge />
      </div>

      {/* Two rows, horizontal scroll matching screenshot */}
      <div className="-mx-4 overflow-x-auto px-4 pb-3 hide-scrollbar scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <div
          className="grid grid-flow-col gap-x-3.5 gap-y-4"
          style={{
            gridTemplateRows: items.length > 3 ? "repeat(2, auto)" : "auto",
            width: "max-content",
          }}
        >
          {items.map((item) => (
            <Card
              key={item.sellerId}
              item={item}
              rotateIndex={rotateIndex}
              onClick={() => navigate(`/store/${item.sellerId}`)}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default BestOffersSection;
