import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { buildHeaderGradient } from "../../utils/headerTheme";

// ─── Particle Effects ────────────────────────────────────────────────────────

function StarsEffect() {
  const stars = useMemo(() =>
    Array.from({ length: 22 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      size: `${Math.random() * 8 + 4}px`,
      delay: `${Math.random() * 3}s`,
      duration: `${Math.random() * 2 + 1.5}s`,
    })), []
  );
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {stars.map((s) => (
        <div
          key={s.id}
          className="absolute rounded-full bg-white opacity-0"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            animation: `twinkle ${s.duration} ${s.delay} infinite ease-in-out`,
          }}
        />
      ))}
      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0; transform: scale(0.5); }
          50% { opacity: 0.9; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}

function SnowEffect() {
  const flakes = useMemo(() =>
    Array.from({ length: 18 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      size: `${Math.random() * 10 + 6}px`,
      delay: `${Math.random() * 4}s`,
      duration: `${Math.random() * 3 + 3}s`,
    })), []
  );
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {flakes.map((f) => (
        <div
          key={f.id}
          className="absolute text-white opacity-70 select-none"
          style={{
            left: f.left,
            top: "-10px",
            fontSize: f.size,
            animation: `snowfall ${f.duration} ${f.delay} infinite linear`,
          }}
        >
          ❄
        </div>
      ))}
      <style>{`
        @keyframes snowfall {
          0% { transform: translateY(-10px) rotate(0deg); opacity: 0.7; }
          100% { transform: translateY(110%) rotate(360deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function LightningEffect() {
  const bolts = useMemo(() =>
    Array.from({ length: 5 }, (_, i) => ({
      id: i,
      left: `${15 + i * 18}%`,
      delay: `${i * 0.8}s`,
    })), []
  );
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {bolts.map((b) => (
        <div
          key={b.id}
          className="absolute text-yellow-300 text-3xl select-none"
          style={{
            left: b.left,
            top: "5%",
            animation: `bolt 2.4s ${b.delay} infinite ease-in-out`,
          }}
        >
          ⚡
        </div>
      ))}
      <style>{`
        @keyframes bolt {
          0%, 100% { opacity: 0; transform: translateY(-8px) scale(0.8); }
          20%, 80% { opacity: 1; transform: translateY(0) scale(1.1); }
        }
      `}</style>
    </div>
  );
}


// ─── Main Component ───────────────────────────────────────────────────────────

export default function DynamicEventBanner({ config, headerColor }) {
  const navigate = useNavigate();

  if (!config) return null;

  const { centerImage, effectType = "stars", eventCategories = [] } = config;

  // Use the same gradient as the active category header — exactly matches the top bar color
  const DEFAULT_COLOR = "#116A29";
  const baseColor = headerColor && headerColor.startsWith("#") ? headerColor : DEFAULT_COLOR;
  const bgGradient = buildHeaderGradient(baseColor);

  const renderEffect = () => {
    if (effectType === "stars") return <StarsEffect />;
    if (effectType === "snow") return <SnowEffect />;
    if (effectType === "lightning") return <LightningEffect />;
    return null;
  };

  const handleCategoryClick = (ec) => {
    if (ec?.categoryId?._id) {
      navigate(`/category/${ec.categoryId._id}`);
    } else if (typeof ec?.categoryId === "string") {
      navigate(`/category/${ec.categoryId}`);
    }
  };

  // Derive category image from populated category
  const getCategoryImage = (ec) => {
    if (ec?.categoryId?.image) return ec.categoryId.image;
    return null;
  };

  const getCategoryName = (ec) => {
    return ec.customLabel || ec?.categoryId?.name || "Category";
  };

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ background: bgGradient, minHeight: "200px" }}
    >
      {/* Effect layer */}
      {renderEffect()}

      {/* Content */}
      <div className="relative z-10 px-4 py-5 flex flex-col items-center gap-3">
        {/* Center Event Image */}
        {centerImage && (
          <div className="w-auto max-w-[200px] h-16 flex items-center justify-center">
            <img
              src={centerImage}
              alt="Event"
              className="max-h-full max-w-full object-contain drop-shadow-lg"
              style={{
                filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.3))",
                animation: "eventImagePulse 2.2s ease-in-out infinite",
              }}
            />
            <style>{`
              @keyframes eventImagePulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.12); }
              }
            `}</style>
          </div>
        )}

        {/* Category Cards Grid */}
        {eventCategories.length > 0 && (
          <div
            className={cn(
              "grid gap-2 w-full mt-1",
              eventCategories.length <= 2 ? "grid-cols-2" :
              eventCategories.length === 3 ? "grid-cols-3" :
              "grid-cols-2"
            )}
          >
            {eventCategories.map((ec, idx) => {
              const catImage = getCategoryImage(ec);
              const catName = getCategoryName(ec);
              const discountText = ec.discountText;

              return (
                <button
                  key={idx}
                  onClick={() => handleCategoryClick(ec)}
                  className="relative flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/25 hover:bg-white/25 active:scale-95 transition-all cursor-pointer text-left"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  {/* Discount badge */}
                  {discountText && (
                    <div className="absolute top-2 right-2 bg-yellow-400 text-yellow-900 text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wide leading-tight shadow-sm">
                      {discountText}
                    </div>
                  )}

                  {/* Category image */}
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-white/20 flex items-center justify-center shrink-0">
                    {catImage ? (
                      <img
                        src={catImage}
                        alt={catName}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-2xl">🛍</span>
                    )}
                  </div>

                  {/* Label */}
                  <span className="text-white text-[11px] font-bold text-center leading-tight line-clamp-2 w-full">
                    {catName}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
