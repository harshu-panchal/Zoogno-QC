import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const Pagination = ({
    page,
    totalPages,
    total,
    pageSize,
    onPageChange,
    onPageSizeChange,
    loading = false,
    compact = false,
    className,
}) => {
    const safePage = Number.isFinite(Number(page)) ? Math.max(1, Number(page)) : 1;
    const safeTotalPages = Number.isFinite(Number(totalPages)) ? Math.max(1, Number(totalPages)) : 1;
    const safeTotal = Number.isFinite(Number(total)) ? Math.max(0, Number(total)) : 0;
    const safePageSize = Number.isFinite(Number(pageSize)) ? Math.max(1, Number(pageSize)) : 1;

    if (safeTotalPages <= 1 && !onPageSizeChange) return null;

    const start = safeTotal === 0 ? 0 : (safePage - 1) * safePageSize + 1;
    const end = Math.min(safePage * safePageSize, safeTotal);

    return (
        <div className={cn("flex items-center justify-between gap-4", compact && "gap-2", className)}>
            <p className="ds-caption text-gray-500">
                Showing <span className="font-semibold text-gray-900">{start}-{end}</span> of {safeTotal}
            </p>
            <div className="flex items-center gap-2">
                {onPageSizeChange && (
                    <select
                        value={pageSize}
                        onChange={(e) => onPageSizeChange(Number(e.target.value))}
                        disabled={loading}
                        className={cn(
                            "rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-600",
                            "focus:ring-2 focus:ring-primary/20 focus:outline-none disabled:opacity-50 cursor-pointer"
                        )}
                    >
                        {PAGE_SIZE_OPTIONS.map((size) => (
                            <option key={size} value={size}>{size}</option>
                        ))}
                    </select>
                )}
                <button
                    disabled={safePage <= 1 || loading}
                    onClick={() => onPageChange(safePage - 1)}
                    className={cn(
                        "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest",
                        "bg-gray-50 text-gray-600 border border-gray-100 hover:bg-gray-100",
                        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-50"
                    )}
                >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Prev
                </button>
                <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                    Page {safePage} of {safeTotalPages}
                </span>
                <button
                    disabled={safePage >= safeTotalPages || loading}
                    onClick={() => onPageChange(safePage + 1)}
                    className={cn(
                        "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest",
                        "bg-gray-50 text-gray-600 border border-gray-100 hover:bg-gray-100",
                        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-50"
                    )}
                >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    );
};

export default Pagination;
