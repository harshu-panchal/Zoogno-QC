import React from "react";
import { useNavigate } from "react-router-dom";
import { HiOutlineChevronRight } from "react-icons/hi2";

const ShopByStoreSection = ({ sellers }) => {
  const navigate = useNavigate();

  if (!sellers || sellers.length === 0) return null;

  return (
    <section className="mb-6 animate-in fade-in slide-in-from-bottom-2 duration-700 relative">
      <div className="flex items-center justify-between mb-3 px-3">
        <h2 className="text-sm font-black text-slate-900 tracking-tight">
          Shop by Store
        </h2>
        {sellers.length > 3 && (
          <button
            onClick={() => {
              // Could navigate to a page listing all sellers if requested later
            }}
            className="flex items-center gap-1 text-[10px] font-black text-brand-600 uppercase tracking-widest hover:text-brand-700 transition-colors"
          >
            See all
            <HiOutlineChevronRight className="h-3 w-3 stroke-[3]" />
          </button>
        )}
      </div>

      <div className="flex overflow-x-auto gap-4 px-3 pb-4 snap-x snap-mandatory hide-scrollbar">
        {sellers.map((seller) => (
          <button
            key={seller._id || seller.id}
            onClick={() => navigate(`/category/all?sellerId=${seller._id || seller.id}`)}
            className="flex flex-col items-center gap-2 snap-center shrink-0 w-24 group transition-transform active:scale-95"
          >
            <div className="h-28 w-24 rounded-[48px_48px_16px_16px] overflow-hidden bg-slate-100 shadow-sm ring-1 ring-slate-200/50 group-hover:shadow-md group-hover:ring-brand-200 transition-all">
              <img
                src={
                  seller.storefrontImage ||
                  seller.shopImage ||
                  `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                    seller.shopName || "store"
                  )}`
                }
                alt={seller.shopName}
                className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-500"
                onError={(e) => {
                  e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                    seller.shopName || "store"
                  )}`;
                }}
              />
            </div>
            <p className="text-[10px] font-black text-slate-700 leading-tight text-center px-1 line-clamp-2">
              {seller.shopName}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
};

export default ShopByStoreSection;
