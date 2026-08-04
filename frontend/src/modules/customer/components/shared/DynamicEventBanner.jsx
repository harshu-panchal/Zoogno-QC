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


function ConfettiEffect() {
  const confetti = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 5}s`,
      duration: `${Math.random() * 3 + 2}s`,
      color: ['#FFC700', '#FF0000', '#2E3192', '#41BBC7'][Math.floor(Math.random() * 4)]
    })), []
  );
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {confetti.map((c) => (
        <div
          key={c.id}
          className="absolute opacity-80"
          style={{
            left: c.left,
            top: "-10px",
            width: "8px",
            height: "16px",
            backgroundColor: c.color,
            animation: `confettiFall ${c.duration} ${c.delay} infinite linear`,
          }}
        />
      ))}
      <style>{`
        @keyframes confettiFall {
          0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(150px) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function HeartsEffect() {
  const hearts = useMemo(() =>
    Array.from({ length: 15 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      size: `${Math.random() * 12 + 10}px`,
      delay: `${Math.random() * 4}s`,
      duration: `${Math.random() * 3 + 4}s`,
    })), []
  );
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {hearts.map((h) => (
        <div
          key={h.id}
          className="absolute text-pink-300 opacity-60 select-none"
          style={{
            left: h.left,
            bottom: "-20px",
            fontSize: h.size,
            animation: `floatUp ${h.duration} ${h.delay} infinite ease-in`,
          }}
        >
          💖
        </div>
      ))}
      <style>{`
        @keyframes floatUp {
          0% { transform: translateY(20px) scale(0.8); opacity: 0.8; }
          100% { transform: translateY(-150px) scale(1.2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function BubblesEffect() {
  const bubbles = useMemo(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      size: `${Math.random() * 15 + 5}px`,
      delay: `${Math.random() * 5}s`,
      duration: `${Math.random() * 4 + 3}s`,
    })), []
  );
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {bubbles.map((b) => (
        <div
          key={b.id}
          className="absolute rounded-full border border-white/40 bg-white/10"
          style={{
            left: b.left,
            bottom: "-20px",
            width: b.size,
            height: b.size,
            animation: `bubbleUp ${b.duration} ${b.delay} infinite ease-in`,
          }}
        />
      ))}
      <style>{`
        @keyframes bubbleUp {
          0% { transform: translateY(20px) scale(0.5); opacity: 0; }
          20% { opacity: 0.8; }
          100% { transform: translateY(-150px) scale(1.5); opacity: 0; }
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
    if (effectType === "confetti") return <ConfettiEffect />;
    if (effectType === "hearts") return <HeartsEffect />;
    if (effectType === "bubbles") return <BubblesEffect />;
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
      {/* Background Ripple Lines */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.06]" 
        style={{
          backgroundImage: "repeating-radial-gradient(ellipse 120% 120% at 50% 20%, transparent 0%, transparent 5%, white 5.2%, transparent 5.4%)"
        }} 
      />

      {/* Effect layer */}
      {renderEffect()}

      {/* Content */}
      <div className="relative z-10 py-5 flex flex-col gap-4">
        {/* Center Event Image */}
        {centerImage && (
          <div className="w-full px-4 h-16 flex items-center justify-center">
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
              @keyframes textFlip {
                0%, 85% { transform: perspective(400px) rotateX(0deg); }
                92% { transform: perspective(400px) rotateX(180deg); opacity: 0.5; }
                100% { transform: perspective(400px) rotateX(360deg); opacity: 1; }
              }
              .hide-scroll::-webkit-scrollbar { display: none; }
              .hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
          </div>
        )}

        {/* Category Cards Scrollable Row */}
        {eventCategories.length > 0 && (
          <div className="w-full overflow-x-auto hide-scroll snap-x px-4 pb-4">
            <div className="flex gap-3 w-max">
              {eventCategories.map((ec, idx) => {
                const catImage = getCategoryImage(ec);
                const catName = getCategoryName(ec);
                const discountText = ec.discountText;

                return (
                  <button
                    key={idx}
                    onClick={() => handleCategoryClick(ec)}
                    className="relative flex flex-col items-center pt-3 pb-4 px-2 rounded-2xl bg-black/25 backdrop-blur-sm border border-white/10 hover:bg-black/35 active:scale-95 transition-all cursor-pointer text-center w-28 shrink-0 snap-start"
                    style={{ WebkitTapHighlightColor: "transparent" }}
                  >
                    {/* Label at Top */}
                    <span 
                      className="text-white text-[11px] font-bold leading-[1.15] line-clamp-2 w-full mb-2 min-h-[26px] flex items-center justify-center"
                      style={{ animation: `textFlip 6s ${idx * 0.8}s infinite` }}
                    >
                      {catName}
                    </span>

                    {/* Category image */}
                    <div className="w-[60px] h-[60px] rounded-xl overflow-hidden flex items-center justify-center shrink-0">
                      {catImage ? (
                        <img
                          src={catImage}
                          alt={catName}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="text-2xl opacity-50">🛍</span>
                      )}
                    </div>

                    {/* Overlapping Discount badge at bottom */}
                    {discountText && (
                      <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 bg-[#FFD700] text-amber-950 text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-wide leading-tight shadow-md whitespace-nowrap border border-yellow-200">
                        {discountText}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
