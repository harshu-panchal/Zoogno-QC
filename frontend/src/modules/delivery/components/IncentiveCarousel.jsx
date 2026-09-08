import React, { useState, useEffect, useRef, useCallback } from "react";
import IncentiveOfferCard from "./IncentiveOfferCard";

const AUTO_SCROLL_INTERVAL = 4000; // 4 seconds per slide

const IncentiveCarousel = ({ offers }) => {
  const [current, setCurrent] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const touchStartX = useRef(null);
  const intervalRef = useRef(null);
  const total = offers.length;

  const goTo = useCallback(
    (index) => {
      if (isTransitioning) return;
      setIsTransitioning(true);
      setCurrent(((index % total) + total) % total);
      setTimeout(() => setIsTransitioning(false), 400);
    },
    [total, isTransitioning]
  );

  // Auto-scroll
  useEffect(() => {
    if (total <= 1) return;
    intervalRef.current = setInterval(() => {
      goTo((prev) => prev + 1);
      setCurrent((prev) => (prev + 1) % total);
    }, AUTO_SCROLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [total]);

  // Pause auto-scroll on touch
  const pauseAutoScroll = () => clearInterval(intervalRef.current);
  const resumeAutoScroll = () => {
    if (total <= 1) return;
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setCurrent((prev) => (prev + 1) % total);
    }, AUTO_SCROLL_INTERVAL);
  };

  // Touch swipe handlers
  const handleTouchStart = (e) => {
    pauseAutoScroll();
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        // Swipe left → next
        setCurrent((prev) => (prev + 1) % total);
      } else {
        // Swipe right → prev
        setCurrent((prev) => (prev - 1 + total) % total);
      }
    }
    touchStartX.current = null;
    resumeAutoScroll();
  };

  if (!offers || offers.length === 0) return null;

  // Single offer — no carousel needed
  if (total === 1) {
    return <IncentiveOfferCard offer={offers[0]} />;
  }

  return (
    <div className="relative">
      {/* Carousel viewport */}
      <div
        className="overflow-hidden rounded-2xl"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex transition-transform duration-400 ease-in-out"
          style={{
            transform: `translateX(-${current * 100}%)`,
            transitionDuration: "400ms",
          }}
        >
          {offers.map((offer, i) => (
            <div key={offer.campaignId || i} className="w-full flex-shrink-0">
              <IncentiveOfferCard offer={offer} />
            </div>
          ))}
        </div>
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-1.5 mt-2.5">
        {offers.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Go to incentive ${i + 1}`}
            onClick={() => {
              pauseAutoScroll();
              setCurrent(i);
              resumeAutoScroll();
            }}
            className={`rounded-full transition-all duration-300 ${
              i === current
                ? "w-5 h-2 bg-orange-500"
                : "w-2 h-2 bg-gray-300 hover:bg-gray-400"
            }`}
          />
        ))}
      </div>
    </div>
  );
};

export default IncentiveCarousel;
