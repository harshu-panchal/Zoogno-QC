import React, { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Search,
  MoreVertical,
  Share2,
  Info,
  Star,
  MapPin,
  Clock,
  ChevronDown,
  Check,
  Percent,
  Plus,
  Minus,
  Utensils,
  Leaf,
  X,
  Phone,
  ShieldCheck,
  Award,
  AlertCircle,
  Copy,
  SlidersHorizontal,
  RotateCw,
} from "lucide-react";
import { customerApi } from "../services/customerApi";
import { useLocation as useAppLocation } from "../context/LocationContext";
import { useCart } from "../context/CartContext";
import { useProductDetail } from "../context/ProductDetailContext";
import { toast } from "sonner";

// High-definition fallback restaurant ambiance video
const FALLBACK_STORE_VIDEO =
  "https://assets.mixkit.co/videos/preview/mixkit-hands-of-a-chef-preparing-a-dish-41566-large.mp4";

const VegIndicator = ({ isVeg = true }) => (
  <div
    className={`w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center p-0.5 ${
      isVeg ? "border-emerald-600" : "border-rose-600"
    }`}
    title={isVeg ? "Pure Vegetarian" : "Non-Vegetarian"}
  >
    {isVeg ? (
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
    ) : (
      <div className="w-0 h-0 border-l-[3.5px] border-l-transparent border-r-[3.5px] border-r-transparent border-b-[6px] border-b-rose-600" />
    )}
  </div>
);

const StorefrontPage = () => {
  const { sellerId } = useParams();
  const navigate = useNavigate();
  const { currentLocation, isLocationReady } = useAppLocation();
  const { cart, cartCount, addToCart, updateQuantity } = useCart();
  const { openProduct } = useProductDetail();

  const [loading, setLoading] = useState(true);
  const [storeData, setStoreData] = useState(null);
  const [error, setError] = useState(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Advanced Filters & Sorting (Exact Match to Screenshot)
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState({
    sortBy: null, // "price_low_high" | "price_high_low"
    foodPreference: null, // "veg" | "egg" | "non-veg"
    highlyReordered: false,
    dietary: null, // "spicy" | "vegan"
  });

  const [draftFilters, setDraftFilters] = useState({
    sortBy: null,
    foodPreference: null,
    highlyReordered: false,
    dietary: null,
  });

  const openFilterModal = () => {
    setDraftFilters({ ...activeFilters });
    setIsFilterModalOpen(true);
  };

  const toggleActiveFilter = (key, value) => {
    setActiveFilters((prev) => ({
      ...prev,
      [key]: prev[key] === value ? null : value,
    }));
  };

  const toggleDraftFilter = (key, value) => {
    setDraftFilters((prev) => ({
      ...prev,
      [key]: prev[key] === value ? null : value,
    }));
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (activeFilters.sortBy) count++;
    if (activeFilters.foodPreference) count++;
    if (activeFilters.highlyReordered) count++;
    if (activeFilters.dietary) count++;
    return count;
  }, [activeFilters]);

  // Modals
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [isReviewsModalOpen, setIsReviewsModalOpen] = useState(false);
  const [isCouponsDrawerOpen, setIsCouponsDrawerOpen] = useState(false);
  const [isMenuDrawerOpen, setIsMenuDrawerOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState("Standard Delivery");

  // Hide floating cart when any modal/drawer is open
  const anyModalOpen =
    isFilterModalOpen ||
    isCouponsDrawerOpen ||
    isReviewsModalOpen ||
    isScheduleModalOpen ||
    isInfoModalOpen ||
    isMenuDrawerOpen;

  useEffect(() => {
    if (anyModalOpen) {
      document.body.classList.add("modal-open-hide-cart");
    } else {
      document.body.classList.remove("modal-open-hide-cart");
    }
    return () => {
      document.body.classList.remove("modal-open-hide-cart");
    };
  }, [anyModalOpen]);

  // Fetch Storefront Data
  useEffect(() => {
    let isMounted = true;
    const fetchStorefront = async () => {
      try {
        setLoading(true);
        setError(null);
        const params = {};
        if (
          isLocationReady &&
          Number.isFinite(currentLocation?.latitude) &&
          Number.isFinite(currentLocation?.longitude)
        ) {
          params.lat = currentLocation.latitude;
          params.lng = currentLocation.longitude;
        }

        const res = await customerApi.getStorefront(sellerId, params);
        if (isMounted) {
          setStoreData(res.data?.result || res.data);
        }
      } catch (err) {
        console.error("Failed to fetch storefront:", err);
        if (isMounted) {
          setError(
            err.response?.data?.message || "Failed to load restaurant details."
          );
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    if (sellerId) {
      fetchStorefront();
    }
    return () => {
      isMounted = false;
    };
  }, [sellerId, isLocationReady, currentLocation?.latitude, currentLocation?.longitude]);

  // Seller Details
  const seller = storeData?.seller || {};
  const coupons = storeData?.coupons || [];
  const reviews = storeData?.reviews || [];
  const rawCategories = useMemo(() => {
    const cats = storeData?.categories || [];
    const sellerSummary = {
      _id: seller._id || sellerId,
      shopName: seller.shopName || seller.name || "this store",
    };
    return cats.map((cat) => ({
      ...cat,
      items: (cat.items || []).map((item) => ({
        ...item,
        sellerId: item.sellerId || sellerSummary,
      })),
    }));
  }, [storeData?.categories, seller._id, seller.shopName, seller.name, sellerId]);

  // Helper matching filter evaluation
  const isItemMatchingFilters = (item, f) => {
    // 1. Food preference (veg / non-veg / egg)
    if (f.foodPreference === "veg") {
      const pref = String(item.foodPreference || "").toLowerCase();
      const isVeg =
        pref === "veg" ||
        pref === "pure_veg" ||
        (!pref.includes("non") &&
          !item.name?.toLowerCase().includes("chicken") &&
          !item.name?.toLowerCase().includes("mutton") &&
          !item.name?.toLowerCase().includes("egg") &&
          !item.name?.toLowerCase().includes("fish"));
      if (!isVeg) return false;
    } else if (f.foodPreference === "non-veg") {
      const pref = String(item.foodPreference || "").toLowerCase();
      const isNonVeg =
        pref.includes("non") ||
        item.name?.toLowerCase().includes("chicken") ||
        item.name?.toLowerCase().includes("mutton") ||
        item.name?.toLowerCase().includes("fish");
      if (!isNonVeg) return false;
    } else if (f.foodPreference === "egg") {
      const nameDesc = `${item.name || ""} ${item.description || ""}`.toLowerCase();
      const isEgg =
        item.foodPreference === "egg" ||
        nameDesc.includes("egg") ||
        nameDesc.includes("anda");
      if (!isEgg) return false;
    }

    // 2. Highly reordered
    if (f.highlyReordered) {
      if (
        !item.isFeatured &&
        (item.ratingCount || 0) < 4 &&
        (item.ratingAverage || 0) < 4.0
      ) {
        return false;
      }
    }

    // 3. Dietary preference (spicy / vegan)
    if (f.dietary === "spicy") {
      const nameDescTags = `${item.name || ""} ${item.description || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
      const isSpicy =
        nameDescTags.includes("spicy") ||
        nameDescTags.includes("chilli") ||
        nameDescTags.includes("chili") ||
        nameDescTags.includes("masala") ||
        nameDescTags.includes("tikka") ||
        nameDescTags.includes("hot") ||
        nameDescTags.includes("schezwan") ||
        nameDescTags.includes("peri peri");
      if (!isSpicy) return false;
    } else if (f.dietary === "vegan") {
      const nameDesc = `${item.name || ""} ${item.description || ""}`.toLowerCase();
      const isNonVegan =
        nameDesc.includes("paneer") ||
        nameDesc.includes("cheese") ||
        nameDesc.includes("butter") ||
        nameDesc.includes("milk") ||
        nameDesc.includes("ghee") ||
        nameDesc.includes("cream") ||
        nameDesc.includes("curd") ||
        nameDesc.includes("dahi") ||
        item.foodPreference === "non-veg" ||
        item.foodPreference === "non_veg";
      if (isNonVegan) return false;
    }

    // 4. Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.name?.toLowerCase().includes(q);
      const matchDesc = item.description?.toLowerCase().includes(q);
      if (!matchName && !matchDesc) return false;
    }

    return true;
  };

  // Real-time matching count for draft filters inside the bottom sheet
  const draftMatchingCount = useMemo(() => {
    let count = 0;
    rawCategories.forEach((cat) => {
      (cat.items || []).forEach((item) => {
        if (isItemMatchingFilters(item, draftFilters)) {
          count++;
        }
      });
    });
    return count;
  }, [rawCategories, draftFilters, searchQuery]);

  // Filter & Sort Categories Feed
  const filteredCategories = useMemo(() => {
    if (!rawCategories.length) return [];
    return rawCategories
      .map((cat) => {
        let items = (cat.items || []).filter((item) =>
          isItemMatchingFilters(item, activeFilters)
        );

        if (activeFilters.sortBy === "price_low_high") {
          items = [...items].sort(
            (a, b) =>
              Number(a.salePrice || a.price || 0) -
              Number(b.salePrice || b.price || 0)
          );
        } else if (activeFilters.sortBy === "price_high_low") {
          items = [...items].sort(
            (a, b) =>
              Number(b.salePrice || b.price || 0) -
              Number(a.salePrice || a.price || 0)
          );
        }

        return {
          ...cat,
          items,
        };
      })
      .filter((cat) => cat.items.length > 0);
  }, [rawCategories, activeFilters, searchQuery]);

  // Top highlight offer
  const topCoupon = coupons[0];

  // Helper to get cart quantity for an item
  const getItemQuantity = (productId) => {
    const found = cart.find(
      (item) =>
        (item.productId?._id || item.productId || item._id) === productId
    );
    return found ? found.quantity : 0;
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: seller.shopName || "Store Details",
          text: `Check out ${seller.shopName || "this store"} on Zoognoo!`,
          url: window.location.href,
        });
      } catch (err) {
        // Ignored
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success("Store link copied to clipboard!");
    }
  };

  const scrollToCategory = (catName) => {
    setIsMenuDrawerOpen(false);
    const element = document.getElementById(`category-${catName}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        {/* Skeleton Hero */}
        <div className="w-full h-[40vh] bg-slate-200 animate-pulse relative" />
        <div className="-mt-8 rounded-t-[32px] bg-white p-5 space-y-4 shadow-xl">
          <div className="w-24 h-5 bg-slate-200 rounded-full animate-pulse" />
          <div className="w-48 h-8 bg-slate-200 rounded-lg animate-pulse" />
          <div className="w-64 h-4 bg-slate-200 rounded animate-pulse" />
          <div className="w-full h-12 bg-slate-100 rounded-2xl animate-pulse" />
          <div className="space-y-6 pt-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-4 p-4 border rounded-2xl">
                <div className="flex-1 space-y-2">
                  <div className="w-32 h-5 bg-slate-200 rounded animate-pulse" />
                  <div className="w-20 h-4 bg-slate-200 rounded animate-pulse" />
                  <div className="w-48 h-3 bg-slate-100 rounded animate-pulse" />
                </div>
                <div className="w-24 h-24 bg-slate-200 rounded-2xl animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !storeData) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mb-4">
          <AlertCircle size={32} />
        </div>
        <h2 className="text-xl font-black text-slate-800 mb-2">Store Not Found</h2>
        <p className="text-sm text-slate-500 max-w-sm mb-6">
          {error || "The requested seller storefront could not be located."}
        </p>
        <button
          onClick={() => navigate(-1)}
          className="px-6 py-2.5 rounded-full bg-slate-900 text-white font-bold text-sm shadow-md active:scale-95"
        >
          Go Back
        </button>
      </div>
    );
  }

  const foodTypeLabel =
    seller.foodType === "PURE_VEG"
      ? "Pure Veg"
      : seller.foodType === "NON_VEG"
      ? "Non-Veg"
      : "Pure Veg & Non-Veg";

  const videoSource = seller.storefrontVideo || FALLBACK_STORE_VIDEO;

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-['Outfit'] pb-24">
      {/* 1. HERO VIDEO SECTION WITH TOP CONTROLS */}
      <div className="relative w-full h-[38vh] sm:h-[46vh] bg-black overflow-hidden select-none">
        <video
          key={videoSource}
          autoPlay
          loop
          muted
          playsInline
          poster={seller.shopImage}
          className="w-full h-full object-cover opacity-90 scale-105"
        >
          <source src={videoSource} type="video/mp4" />
        </video>

        {/* Cinematic gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/75 pointer-events-none" />

        {/* Top Floating Action Bar */}
        <div className="absolute top-3 inset-x-0 px-4 flex items-center justify-between z-20">
          <button
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="w-10 h-10 rounded-full bg-black/45 backdrop-blur-md text-white flex items-center justify-center border border-white/15 shadow-lg active:scale-90 transition-transform"
          >
            <ArrowLeft size={20} />
          </button>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsSearchOpen((prev) => !prev)}
              aria-label="Search Dishes"
              className="px-3.5 py-1.5 rounded-full bg-black/45 backdrop-blur-md text-white/95 text-xs font-bold flex items-center gap-1.5 border border-white/15 shadow-lg active:scale-95 transition-transform"
            >
              <Search size={14} />
              <span>Search</span>
            </button>

            <button
              onClick={handleShare}
              aria-label="Share Store"
              className="w-10 h-10 rounded-full bg-black/45 backdrop-blur-md text-white flex items-center justify-center border border-white/15 shadow-lg active:scale-90 transition-transform"
            >
              <Share2 size={18} />
            </button>
          </div>
        </div>

        {/* Bottom Hero Caption & Dots (Exact match to reference screenshot: Combo 3 >  ••) */}
        <div className="absolute bottom-10 inset-x-0 px-5 flex flex-col items-center pointer-events-none z-10">
          <div className="bg-black/40 backdrop-blur-md border border-white/20 text-white/95 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-md mb-2">
            <span>Specialty Dishes</span>
            <span className="text-[10px] text-white/70">›</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-5 h-1.5 rounded-full bg-white shadow-xs" />
            <span className="w-1.5 h-1.5 rounded-full bg-white/50" />
            <span className="w-1.5 h-1.5 rounded-full bg-white/50" />
          </div>
        </div>
      </div>

      {/* 2. OVERLAPPING WHITE SHEET CARD */}
      <div className="relative -mt-6 sm:-mt-8 mx-auto max-w-3xl px-3 sm:px-4 z-20">
        <div className="bg-white rounded-t-[28px] sm:rounded-t-[32px] rounded-b-2xl p-4 sm:p-6 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] border border-slate-100">
          {/* Top Notch Pill */}
          <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-3" />

          {/* Pure Veg / Non-Veg Badge */}
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Leaf size={12} className="text-emerald-600 fill-emerald-600" />
              {foodTypeLabel}
            </span>
          </div>

          {/* Store Name & High-Contrast Rating Badge (Reference match) */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-tight break-words min-w-0">
                  {seller.shopName || seller.name}
                </h1>
                <button
                  onClick={() => setIsInfoModalOpen(true)}
                  aria-label="Store Information"
                  className="text-slate-400 hover:text-slate-700 transition-colors"
                >
                  <Info size={18} />
                </button>
              </div>

              {/* Distance & Locality */}
              <div className="flex items-start gap-1.5 text-xs sm:text-sm text-slate-600 font-semibold mt-1.5">
                <MapPin size={14} className="text-slate-400 shrink-0 mt-0.5" />
                <span className="shrink-0">
                  {seller.distanceKm ? `${seller.distanceKm} km` : "Nearby"}
                </span>
                <span className="text-slate-300 shrink-0">•</span>
                <span className="min-w-0 break-words">
                  {seller.locality || seller.city || seller.address || "Local Market"}
                </span>
              </div>

              {/* Delivery Time & Scheduling */}
              <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-xs sm:text-sm text-slate-600 font-semibold mt-1">
                <Clock size={14} className="text-slate-400 shrink-0" />
                <span>{selectedSlot === "Standard Delivery" ? (seller.deliveryTime || "25-35 mins") : selectedSlot}</span>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={() => setIsScheduleModalOpen(true)}
                  className="text-slate-800 font-bold flex items-center gap-0.5 hover:text-brand-600 transition-colors"
                >
                  Schedule for later <ChevronDown size={14} />
                </button>
              </div>
            </div>

            {/* Green Rating Badge with Review Count Link */}
            <div className="text-right shrink-0">
              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#137538] text-white font-black text-sm shadow-xs">
                <span>{Number(seller.ratingAverage || 4.2).toFixed(1)}</span>
                <Star size={13} className="fill-white" />
              </div>
              <button
                type="button"
                onClick={() => setIsReviewsModalOpen(true)}
                className="block text-[11px] text-slate-400 font-bold border-b border-dashed border-slate-300 hover:text-slate-700 hover:border-slate-500 mt-1 ml-auto"
              >
                By {seller.ratingCount ? `${seller.ratingCount} ratings` : "1.2K+ ratings"}
              </button>
            </div>
          </div>

          {/* Trust Chips (Reference Match) */}
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-100 text-[11px] font-bold text-slate-700">
              <Check size={12} className="text-emerald-600 stroke-[3] shrink-0" />
              No packaging charges
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-100 text-[11px] font-bold text-slate-700">
              <Check size={12} className="text-emerald-600 stroke-[3] shrink-0" />
              Last 100 orders with on-time delivery
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-100 text-[11px] font-bold text-slate-700">
              <Check size={12} className="text-emerald-600 stroke-[3] shrink-0" />
              FSSAI Verified
            </span>
          </div>

          {/* Active Offers / Coupon Banner (Exact reference match) */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Percent size={13} className="stroke-[2.5]" />
              </div>
              <p className="text-xs sm:text-sm font-black text-slate-800 min-w-0 break-words">
                {topCoupon
                  ? `${topCoupon.title || topCoupon.description || `Flat ₹${topCoupon.discountValue || 40} OFF`}`
                  : "Flat ₹40 OFF above ₹199"}
              </p>
            </div>

            <button
              onClick={() => setIsCouponsDrawerOpen(true)}
              className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-0.5 whitespace-nowrap shrink-0 mt-0.5"
            >
              <span>{coupons.length > 0 ? `${coupons.length} offers` : "4 offers"}</span>
              <ChevronDown size={14} />
            </button>
          </div>
        </div>

        {/* 3. DISH SEARCH & FILTER BAR */}
        <div className="mt-4 space-y-3">
          {/* Live Search Input (expandable) */}
          {isSearchOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative"
            >
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search within this menu..."
                autoFocus
                className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-white border border-slate-200 text-sm font-semibold text-slate-800 outline-none focus:border-slate-900 shadow-xs transition-all"
              />
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={16} />
                </button>
              )}
            </motion.div>
          )}

          {/* Filter Pills (Screenshot Match) */}
          <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {/* Filters Dropdown Pill */}
            <button
              onClick={openFilterModal}
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all whitespace-nowrap shadow-2xs ${
                activeFilterCount > 0
                  ? "bg-slate-900 border-slate-900 text-white"
                  : "bg-white border-slate-200 text-slate-800 hover:border-slate-300"
              }`}
            >
              <SlidersHorizontal
                size={13}
                className={activeFilterCount > 0 ? "text-white" : "text-slate-700"}
              />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-white text-slate-900 text-[10px] font-black flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown
                size={13}
                className={activeFilterCount > 0 ? "text-white/80" : "text-slate-500"}
              />
            </button>

            {/* Veg Pill */}
            <button
              onClick={() => toggleActiveFilter("foodPreference", "veg")}
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all whitespace-nowrap shadow-2xs ${
                activeFilters.foodPreference === "veg"
                  ? "border-emerald-600 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-600"
                  : "bg-white border-slate-200 text-slate-800 hover:border-slate-300"
              }`}
            >
              <div className="w-3.5 h-3.5 rounded-[3px] border border-emerald-600 flex items-center justify-center p-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              </div>
              <span>Veg</span>
            </button>

            {/* Non-veg Pill */}
            <button
              onClick={() => toggleActiveFilter("foodPreference", "non-veg")}
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all whitespace-nowrap shadow-2xs ${
                activeFilters.foodPreference === "non-veg"
                  ? "border-[#a0442c] bg-amber-50 text-[#85341f] ring-1 ring-[#a0442c]"
                  : "bg-white border-slate-200 text-slate-800 hover:border-slate-300"
              }`}
            >
              <div className="w-3.5 h-3.5 rounded-[3px] border border-[#a0442c] flex items-center justify-center p-0.5">
                <div className="w-0 h-0 border-l-[3.5px] border-l-transparent border-r-[3.5px] border-r-transparent border-b-[6px] border-b-[#a0442c]" />
              </div>
              <span>Non-veg</span>
            </button>

            {/* Highly reordered Pill */}
            <button
              onClick={() =>
                toggleActiveFilter(
                  "highlyReordered",
                  !activeFilters.highlyReordered
                )
              }
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all whitespace-nowrap shadow-2xs ${
                activeFilters.highlyReordered
                  ? "border-emerald-600 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-600"
                  : "bg-white border-slate-200 text-slate-800 hover:border-slate-300"
              }`}
            >
              <RotateCw size={13} className="text-emerald-600 stroke-[2.5]" />
              <span>Highly reordered</span>
            </button>
          </div>
        </div>

        {/* 4. CATEGORY-WISE MENU DISHES FEED */}
        <div className="mt-5 space-y-6">
          {filteredCategories.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center border border-slate-100 shadow-xs">
              <Utensils size={32} className="mx-auto text-slate-300 mb-2" />
              <h3 className="text-base font-black text-slate-800">No dishes found</h3>
              <p className="text-xs text-slate-500 mt-1">
                Try relaxing your search or filter options.
              </p>
            </div>
          ) : (
            filteredCategories.map((cat) => (
              <div
                key={cat.name}
                id={`category-${cat.name}`}
                className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-100"
              >
                {/* Category Heading */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                  <h2 className="text-lg font-black text-slate-900 tracking-tight">
                    {cat.name} ({cat.items.length})
                  </h2>
                </div>

                {/* Items List */}
                <div className="divide-y divide-slate-100">
                  {cat.items.map((item) => {
                    const quantity = getItemQuantity(item._id);
                    const isVeg = item.foodPreference !== "non_veg";
                    const dishImage =
                      item.mainImage ||
                      item.image ||
                      "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=300";

                    return (
                      <div
                        key={item._id}
                        className="py-4 first:pt-0 last:pb-0 flex items-start justify-between gap-4"
                      >
                        {/* Left Details */}
                        <div
                          onClick={() => openProduct && openProduct(item)}
                          className="flex-1 min-w-0 pr-2 cursor-pointer"
                        >
                          <VegIndicator isVeg={isVeg} />
                          <h3 className="text-sm sm:text-base font-bold text-slate-900 mt-1.5 leading-snug hover:text-brand-600 transition-colors">
                            {item.name}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-sm sm:text-base font-black text-slate-900">
                              ₹{item.salePrice || item.price}
                            </span>
                            {item.salePrice && item.salePrice < item.price && (
                              <span className="text-xs text-slate-400 line-through">
                                ₹{item.price}
                              </span>
                            )}
                          </div>

                          {item.ratingAverage ? (
                            <div className="flex items-center gap-1 mt-1 text-[11px] text-emerald-700 font-bold">
                              <Star size={11} className="fill-emerald-600 text-emerald-600" />
                              <span>{Number(item.ratingAverage).toFixed(1)}</span>
                              {item.ratingCount > 0 && (
                                <span className="text-slate-400">({item.ratingCount})</span>
                              )}
                            </div>
                          ) : null}

                          {item.description && (
                            <p className="text-xs text-slate-500 font-normal line-clamp-2 mt-1.5 leading-relaxed">
                              {item.description}
                            </p>
                          )}
                        </div>

                        {/* Right Dish Image with ADD Counter */}
                        <div className="relative w-28 sm:w-32 h-28 sm:h-32 shrink-0">
                          <img
                            src={dishImage}
                            alt={item.name}
                            loading="lazy"
                            onClick={() => openProduct && openProduct(item)}
                            className="w-full h-full object-cover rounded-2xl bg-slate-100 shadow-xs cursor-pointer hover:opacity-95 transition-opacity"
                          />

                          {/* Floating ADD Button (Zomato/Swiggy exact layout) */}
                          <div className="absolute -bottom-2 inset-x-0 flex justify-center">
                            {quantity === 0 ? (
                              <button
                                onClick={() => addToCart(item)}
                                className="px-5 py-1.5 rounded-xl bg-white text-emerald-700 border border-emerald-300 font-black text-xs uppercase tracking-wider shadow-md hover:bg-emerald-50 active:scale-95 transition-all"
                              >
                                ADD
                              </button>
                            ) : (
                              <div className="flex items-center bg-white text-emerald-700 border border-emerald-400 rounded-xl shadow-md overflow-hidden font-black text-xs">
                                <button
                                  onClick={() =>
                                    updateQuantity(item._id, -1)
                                  }
                                  className="px-2.5 py-1 hover:bg-slate-100 active:scale-90"
                                >
                                  <Minus size={13} />
                                </button>
                                <span className="px-2">{quantity}</span>
                                <button
                                  onClick={() =>
                                    updateQuantity(item._id, 1)
                                  }
                                  className="px-2.5 py-1 hover:bg-slate-100 active:scale-90"
                                >
                                  <Plus size={13} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 5. FLOATING MENU BUTTON (Quick Category Jump) */}
      {filteredCategories.length > 0 && (
        <button
          onClick={() => setIsMenuDrawerOpen(true)}
          className={`fixed right-4 sm:right-8 z-40 bg-slate-900/95 backdrop-blur-md text-white px-4 py-2.5 rounded-full font-black text-xs tracking-wider uppercase shadow-2xl flex items-center gap-2 hover:bg-black active:scale-95 transition-all border border-white/20 ${
            cartCount > 0 ? "bottom-24 sm:bottom-24" : "bottom-20"
          }`}
        >
          <Utensils size={15} />
          <span>Menu</span>
        </button>
      )}

      {/* 6. MODALS & SHEETS */}

      {/* Store Info Modal */}
      <AnimatePresence>
        {isInfoModalOpen && (
          <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-lg font-black text-slate-900">
                  {seller.shopName || seller.name}
                </h3>
                <button
                  onClick={() => setIsInfoModalOpen(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-700"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-3 text-sm text-slate-600">
                <div className="flex items-start gap-2.5">
                  <MapPin size={18} className="text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-slate-900">Outlet Address</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {seller.address || "Market Road"}, {seller.locality || ""}, {seller.city || ""}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <Clock size={18} className="text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-slate-900">Preparation & Delivery</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Takes ~{seller.preparationTime || 15} mins prep • Delivery in {seller.deliveryTime || "30-40 mins"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <ShieldCheck size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-slate-900">Food Safety & Hygiene</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Kitchen hygiene checked & certified partner.
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setIsInfoModalOpen(false)}
                className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs uppercase tracking-wider"
              >
                Close
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Customer Reviews Modal */}
      <AnimatePresence>
        {isReviewsModalOpen && (
          <div className="fixed inset-0 z-[100000] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-white rounded-t-3xl sm:rounded-3xl max-w-lg w-full max-h-[80vh] flex flex-col p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="px-2.5 py-1 rounded-lg bg-[#137538] text-white font-black text-sm flex items-center gap-1">
                    <span>{Number(seller.ratingAverage || 4.2).toFixed(1)}</span>
                    <Star size={13} className="fill-white" />
                  </div>
                  <h3 className="text-base font-black text-slate-900">
                    Customer Ratings & Reviews
                  </h3>
                </div>
                <button
                  onClick={() => setIsReviewsModalOpen(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-700"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Reviews List */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 py-2">
                {reviews.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-8">
                    No verified customer reviews yet for this restaurant.
                  </p>
                ) : (
                  reviews.map((rev) => (
                    <div key={rev._id} className="py-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">
                          {rev.userId?.name || "Verified Customer"}
                        </span>
                        <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-black">
                          <span>{rev.rating}</span>
                          <Star size={9} className="fill-emerald-600" />
                        </div>
                      </div>
                      {rev.comment && (
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {rev.comment}
                        </p>
                      )}
                      <span className="text-[10px] text-slate-400 block">
                        {new Date(rev.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Coupons Bottom Sheet */}
      <AnimatePresence>
        {isCouponsDrawerOpen && (
          <div className="fixed inset-0 z-[100000] flex items-end justify-center bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-white rounded-t-[32px] max-w-lg w-full max-h-[75vh] flex flex-col p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Percent size={18} className="text-blue-500" />
                  Available Coupons & Offers
                </h3>
                <button
                  onClick={() => setIsCouponsDrawerOpen(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-700"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 py-3 space-y-3">
                {coupons.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-8">
                    No active coupons at this time.
                  </p>
                ) : (
                  coupons.map((c) => (
                    <div
                      key={c._id}
                      className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 font-black text-xs tracking-wider">
                            {c.code}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-800 mt-1">
                          {c.title || c.description}
                        </p>
                        {c.minOrderValue > 0 && (
                          <p className="text-[11px] text-slate-400">
                            Valid on orders above ₹{c.minOrderValue}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(c.code);
                          toast.success(`Coupon code ${c.code} copied!`);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-black uppercase tracking-wider shadow-xs active:scale-95 shrink-0"
                      >
                        Copy
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Category Quick Jump Drawer */}
      <AnimatePresence>
        {isMenuDrawerOpen && (
          <div className="fixed inset-0 z-[100000] flex items-end justify-center bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-white rounded-t-[32px] max-w-lg w-full max-h-[60vh] flex flex-col p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-black text-slate-900">
                  Menu Categories
                </h3>
                <button
                  onClick={() => setIsMenuDrawerOpen(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-700"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 py-2">
                {filteredCategories.map((cat) => (
                  <button
                    key={cat.name}
                    onClick={() => scrollToCategory(cat.name)}
                    className="w-full py-3 flex items-center justify-between text-left hover:bg-slate-50 px-2 rounded-xl transition-colors"
                  >
                    <span className="text-sm font-bold text-slate-800">
                      {cat.name}
                    </span>
                    <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                      {cat.items.length}
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Schedule For Later Drawer */}
      <AnimatePresence>
        {isScheduleModalOpen && (
          <div className="fixed inset-0 z-[100000] flex items-end justify-center bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-white rounded-t-[32px] max-w-lg w-full p-5 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Clock size={18} className="text-brand-600" />
                  <h3 className="text-base font-black text-slate-900">
                    Choose Delivery Timing
                  </h3>
                </div>
                <button
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-700"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-2 py-1">
                {[
                  {
                    title: "Standard Delivery (Fastest)",
                    time: seller.deliveryTime || "25-35 mins",
                    desc: "Order prepared and delivered immediately",
                  },
                  {
                    title: "Today Evening Slot",
                    time: "7:00 PM - 8:00 PM",
                    desc: "Freshly prepared for dinner",
                  },
                  {
                    title: "Today Late Dinner",
                    time: "8:30 PM - 9:30 PM",
                    desc: "Pre-order for night dining",
                  },
                  {
                    title: "Tomorrow Lunch",
                    time: "Tomorrow 12:30 PM - 1:30 PM",
                    desc: "Scheduled next-day delivery",
                  },
                ].map((slot) => {
                  const isSelected = selectedSlot === slot.time || (slot.title.startsWith("Standard") && selectedSlot === "Standard Delivery");
                  return (
                    <button
                      key={slot.time}
                      onClick={() => {
                        setSelectedSlot(slot.title.startsWith("Standard") ? "Standard Delivery" : slot.time);
                        setIsScheduleModalOpen(false);
                        toast.success(`Delivery scheduled for: ${slot.time}`);
                      }}
                      className={`w-full p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between ${
                        isSelected
                          ? "border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20"
                          : "border-slate-200 bg-slate-50/50 hover:bg-slate-50"
                      }`}
                    >
                      <div>
                        <p className="text-xs font-black text-slate-900">{slot.title}</p>
                        <p className="text-sm font-extrabold text-emerald-700 mt-0.5">{slot.time}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{slot.desc}</p>
                      </div>
                      {isSelected && <Check size={18} className="text-emerald-600" />}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 7. FILTERS AND SORTING BOTTOM SHEET MODAL (Screenshot 1 Exact Match) */}
      <AnimatePresence>
        {isFilterModalOpen && (
          <div className="fixed inset-0 z-[100000] flex items-end justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
            <div className="max-w-lg w-full flex flex-col items-center">
              {/* Floating Dark Close Button Above Modal */}
              <button
                type="button"
                onClick={() => setIsFilterModalOpen(false)}
                className="w-10 h-10 rounded-full bg-[#272b38] hover:bg-black text-white flex items-center justify-center shadow-2xl mb-3 active:scale-90 transition-transform cursor-pointer border border-white/10"
              >
                <X size={20} className="stroke-[2.5]" />
              </button>

              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 28, stiffness: 300 }}
                className="bg-[#f5f6fb] rounded-t-[32px] sm:rounded-[32px] w-full max-h-[82vh] flex flex-col shadow-2xl overflow-hidden"
              >
                {/* Header */}
                <div className="px-6 pt-5 pb-3 bg-white border-b border-slate-100">
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">
                    Filters and Sorting
                  </h2>
                </div>

                {/* Scrollable Filter Cards */}
                <div className="p-4 space-y-3.5 overflow-y-auto flex-1 hide-scrollbar">
                  {/* Sort by Card */}
                  <div className="bg-white rounded-2xl p-4 shadow-2xs border border-slate-100">
                    <h3 className="text-sm font-black text-slate-900 mb-3">Sort by</h3>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => toggleDraftFilter("sortBy", "price_low_high")}
                        className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                          draftFilters.sortBy === "price_low_high"
                            ? "border-slate-900 bg-slate-900 text-white shadow-2xs"
                            : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
                        }`}
                      >
                        Price - low to high
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleDraftFilter("sortBy", "price_high_low")}
                        className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                          draftFilters.sortBy === "price_high_low"
                            ? "border-slate-900 bg-slate-900 text-white shadow-2xs"
                            : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
                        }`}
                      >
                        Price - high to low
                      </button>
                    </div>
                  </div>

                  {/* Veg/Non-veg preference Card */}
                  <div className="bg-white rounded-2xl p-4 shadow-2xs border border-slate-100">
                    <h3 className="text-sm font-black text-slate-900 mb-3">
                      Veg/Non-veg preference
                    </h3>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => toggleDraftFilter("foodPreference", "veg")}
                        className={`px-4 py-2 rounded-xl text-xs font-bold border flex items-center gap-2 transition-all ${
                          draftFilters.foodPreference === "veg"
                            ? "border-emerald-600 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-600 shadow-2xs"
                            : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
                        }`}
                      >
                        <div className="w-3.5 h-3.5 rounded-[3px] border border-emerald-600 flex items-center justify-center p-0.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                        </div>
                        <span>Veg</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleDraftFilter("foodPreference", "egg")}
                        className={`px-4 py-2 rounded-xl text-xs font-bold border flex items-center gap-2 transition-all ${
                          draftFilters.foodPreference === "egg"
                            ? "border-amber-600 bg-amber-50 text-amber-950 ring-1 ring-amber-600 shadow-2xs"
                            : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
                        }`}
                      >
                        <span className="text-sm">🥚</span>
                        <span>Egg</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleDraftFilter("foodPreference", "non-veg")}
                        className={`px-4 py-2 rounded-xl text-xs font-bold border flex items-center gap-2 transition-all ${
                          draftFilters.foodPreference === "non-veg"
                            ? "border-[#a0442c] bg-amber-50 text-[#85341f] ring-1 ring-[#a0442c] shadow-2xs"
                            : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
                        }`}
                      >
                        <div className="w-3.5 h-3.5 rounded-[3px] border border-[#a0442c] flex items-center justify-center p-0.5">
                          <div className="w-0 h-0 border-l-[3.5px] border-l-transparent border-r-[3.5px] border-r-transparent border-b-[6px] border-b-[#a0442c]" />
                        </div>
                        <span>Non-veg</span>
                      </button>
                    </div>
                  </div>

                  {/* Top picks Card */}
                  <div className="bg-white rounded-2xl p-4 shadow-2xs border border-slate-100">
                    <h3 className="text-sm font-black text-slate-900 mb-3">Top picks</h3>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() =>
                          toggleDraftFilter("highlyReordered", !draftFilters.highlyReordered)
                        }
                        className={`px-4 py-2 rounded-xl text-xs font-bold border flex items-center gap-2 transition-all ${
                          draftFilters.highlyReordered
                            ? "border-emerald-600 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-600 shadow-2xs"
                            : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
                        }`}
                      >
                        <RotateCw size={13} className="text-emerald-600 stroke-[2.5]" />
                        <span>Highly reordered</span>
                      </button>
                    </div>
                  </div>

                  {/* Dietary preference Card */}
                  <div className="bg-white rounded-2xl p-4 shadow-2xs border border-slate-100">
                    <h3 className="text-sm font-black text-slate-900 mb-3">
                      Dietary preference
                    </h3>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => toggleDraftFilter("dietary", "spicy")}
                        className={`px-4 py-2 rounded-xl text-xs font-bold border flex items-center gap-2 transition-all ${
                          draftFilters.dietary === "spicy"
                            ? "border-rose-600 bg-rose-50 text-rose-950 ring-1 ring-rose-600 shadow-2xs"
                            : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
                        }`}
                      >
                        <span className="text-sm">🌶</span>
                        <span>Spicy</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleDraftFilter("dietary", "vegan")}
                        className={`px-4 py-2 rounded-xl text-xs font-bold border flex items-center gap-2 transition-all ${
                          draftFilters.dietary === "vegan"
                            ? "border-emerald-600 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-600 shadow-2xs"
                            : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
                        }`}
                      >
                        <span className="text-sm">🍃</span>
                        <span>Vegan</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Footer (Clear All & Apply) */}
                <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-between gap-4 sticky bottom-0 z-20 shrink-0 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                  <button
                    type="button"
                    onClick={() => {
                      setDraftFilters({
                        sortBy: null,
                        foodPreference: null,
                        highlyReordered: false,
                        dietary: null,
                      });
                    }}
                    className="text-[#e23744] hover:text-[#c52c38] font-black text-base px-2 py-2 transition-colors cursor-pointer"
                  >
                    Clear All
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveFilters({ ...draftFilters });
                      setIsFilterModalOpen(false);
                    }}
                    className="px-8 py-3.5 rounded-2xl font-black text-sm bg-slate-900 hover:bg-black text-white shadow-xl active:scale-95 transition-all cursor-pointer"
                  >
                    Apply ({draftMatchingCount})
                  </button>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default StorefrontPage;
