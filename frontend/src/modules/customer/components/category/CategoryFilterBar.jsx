import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownAZ,
  Check,
  ChevronDown,
  PackageOpen,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "name-asc", label: "Name: A to Z" },
];

const FilterButton = ({ active, icon: Icon, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "h-11 shrink-0 rounded-xl border px-3 flex items-center justify-center gap-1.5 bg-white text-[12px] sm:text-sm font-bold shadow-sm transition-colors",
      active
        ? "border-primary text-primary bg-primary/5"
        : "border-slate-200 text-slate-700 hover:border-slate-300",
    )}
  >
    <Icon size={16} strokeWidth={2.2} />
    <span className="whitespace-nowrap">{label}</span>
    <ChevronDown size={15} className="text-slate-500" />
  </button>
);

const Choice = ({ checked, children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full min-h-11 px-3 flex items-center justify-between rounded-xl text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
  >
    <span>{children}</span>
    {checked && <Check size={18} className="text-primary" strokeWidth={3} />}
  </button>
);

const CategoryFilterBar = ({
  values,
  quantityOptions,
  onChange,
  onClearFilters,
}) => {
  const [openPanel, setOpenPanel] = useState(null);
  const [minPrice, setMinPrice] = useState(values.minPrice || "");
  const [maxPrice, setMaxPrice] = useState(values.maxPrice || "");
  const panelRef = useRef(null);

  useEffect(() => {
    if (!openPanel) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpenPanel(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [openPanel]);

  const filterCount = useMemo(
    () =>
      [
        values.stockStatus,
        values.onSale === "true" ? "sale" : "",
        values.foodPreference,
        values.minPrice || values.maxPrice ? "price" : "",
      ].filter(Boolean).length,
    [values],
  );

  const sortLabel = SORT_OPTIONS.find((option) => option.value === values.sort)?.label;
  const quantityLabel = values.weight || "Quantity";

  const togglePanel = (panel) => {
    if (panel === "filters" && openPanel !== "filters") {
      setMinPrice(values.minPrice || "");
      setMaxPrice(values.maxPrice || "");
    }
    setOpenPanel((current) => (current === panel ? null : panel));
  };

  const selectAndClose = (patch) => {
    onChange(patch);
    setOpenPanel(null);
  };

  const applyPrice = () => {
    const parsedMin = minPrice === "" ? "" : Math.max(0, Number(minPrice));
    const parsedMax = maxPrice === "" ? "" : Math.max(0, Number(maxPrice));
    if (parsedMin !== "" && parsedMax !== "" && parsedMin > parsedMax) return;
    onChange({ minPrice: parsedMin, maxPrice: parsedMax });
    setOpenPanel(null);
  };

  return (
    <div className="sticky top-[57px] z-30 -mx-2 md:-mx-6 bg-white border-b border-slate-100 px-2 md:px-6 py-2.5">
      <div className="flex gap-2 overflow-x-auto hide-scrollbar" aria-label="Product filters">
        <FilterButton
          active={filterCount > 0}
          icon={SlidersHorizontal}
          label={filterCount ? `Filters (${filterCount})` : "Filters"}
          onClick={() => togglePanel("filters")}
        />
        <FilterButton
          active={Boolean(values.sort && values.sort !== "newest")}
          icon={ArrowDownAZ}
          label={sortLabel || "Sort"}
          onClick={() => togglePanel("sort")}
        />
        <FilterButton
          active={Boolean(values.weight)}
          icon={PackageOpen}
          label={quantityLabel}
          onClick={() => togglePanel("quantity")}
        />
      </div>

      {openPanel && (
        <>
          <button
            type="button"
            aria-label="Close filters"
            className="fixed inset-0 z-30 bg-black/20 md:bg-black/5"
            onClick={() => setOpenPanel(null)}
          />
          <section
            ref={panelRef}
            role="dialog"
            aria-label={`${openPanel} options`}
            className="fixed z-40 left-[82px] right-3 top-[118px] max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl md:absolute md:left-6 md:right-auto md:top-[calc(100%+8px)] md:w-[360px]"
          >
            <div className="flex items-center justify-between px-2 pb-2 border-b border-slate-100">
              <h2 className="font-black text-slate-900">
                {openPanel === "filters" ? "Filters" : openPanel === "sort" ? "Sort by" : "Quantity"}
              </h2>
              <button
                type="button"
                onClick={() => setOpenPanel(null)}
                className="p-1.5 rounded-full hover:bg-slate-100"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {openPanel === "sort" && (
              <div className="pt-2">
                {SORT_OPTIONS.map((option) => (
                  <Choice
                    key={option.value}
                    checked={(values.sort || "newest") === option.value}
                    onClick={() => selectAndClose({ sort: option.value })}
                  >
                    {option.label}
                  </Choice>
                ))}
              </div>
            )}

            {openPanel === "quantity" && (
              <div className="pt-2">
                <Choice checked={!values.weight} onClick={() => selectAndClose({ weight: "" })}>
                  All quantities
                </Choice>
                {quantityOptions.map((quantity) => (
                  <Choice
                    key={quantity}
                    checked={values.weight === quantity}
                    onClick={() => selectAndClose({ weight: quantity })}
                  >
                    {quantity}
                  </Choice>
                ))}
                {quantityOptions.length === 0 && (
                  <p className="px-3 py-5 text-sm text-slate-500 text-center">
                    Quantity options will appear when products load.
                  </p>
                )}
              </div>
            )}

            {openPanel === "filters" && (
              <div className="pt-3 space-y-4">
                <div>
                  <p className="px-2 mb-1 text-xs font-black uppercase tracking-wider text-slate-400">Availability</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: "", label: "All" },
                      { value: "in", label: "In stock" },
                    ].map((option) => (
                      <button
                        type="button"
                        key={option.value}
                        onClick={() => onChange({ stockStatus: option.value })}
                        className={cn(
                          "h-10 rounded-xl border text-sm font-bold",
                          values.stockStatus === option.value
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-slate-200 text-slate-600",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="px-2 mb-1 text-xs font-black uppercase tracking-wider text-slate-400">Preference</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: "", label: "All" },
                      { value: "veg", label: "Veg" },
                      { value: "non-veg", label: "Non-veg" },
                    ].map((option) => (
                      <button
                        type="button"
                        key={option.value}
                        onClick={() => onChange({ foodPreference: option.value })}
                        className={cn(
                          "h-10 rounded-xl border text-xs font-bold",
                          values.foodPreference === option.value
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-slate-200 text-slate-600",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-3 cursor-pointer">
                  <span className="text-sm font-bold text-slate-700">Show discounted products only</span>
                  <input
                    type="checkbox"
                    checked={values.onSale === "true"}
                    onChange={(event) => onChange({ onSale: event.target.checked ? "true" : "" })}
                    className="h-4 w-4 accent-primary"
                  />
                </label>

                <div>
                  <p className="px-2 mb-2 text-xs font-black uppercase tracking-wider text-slate-400">Price range</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={minPrice}
                      onChange={(event) => setMinPrice(event.target.value)}
                      placeholder="Min ₹"
                      className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-primary"
                    />
                    <span className="text-slate-400">–</span>
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={maxPrice}
                      onChange={(event) => setMaxPrice(event.target.value)}
                      placeholder="Max ₹"
                      className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  {minPrice !== "" && maxPrice !== "" && Number(minPrice) > Number(maxPrice) && (
                    <p className="mt-1.5 text-xs font-semibold text-red-500">Minimum price must be lower than maximum price.</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      onClearFilters();
                      setMinPrice("");
                      setMaxPrice("");
                    }}
                    className="h-11 rounded-xl border border-slate-200 text-sm font-black text-slate-600"
                  >
                    Clear all
                  </button>
                  <button
                    type="button"
                    onClick={applyPrice}
                    className="h-11 rounded-xl bg-primary text-primary-foreground text-sm font-black"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default CategoryFilterBar;
