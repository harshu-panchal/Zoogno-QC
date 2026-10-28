import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Reusable "which zones can see this" picker. Empty `selectedIds` means
 * "All Zones" (the convention used across the admin's zone-scoped marketing
 * content — coupons, offer sections, experience sections, hero banners).
 */
const ZoneScopeSelector = ({
    zones = [],
    selectedIds = [],
    onChange,
    label = 'Zone Availability',
    allZonesLabel = 'All Zones',
    emptyHint = 'Visible to customers everywhere.',
    scopedHint = 'Only visible to customers in the selected zone(s).',
}) => {
    const toggleZone = (zoneId) => {
        const isSelected = selectedIds.includes(zoneId);
        onChange(
            isSelected
                ? selectedIds.filter((id) => id !== zoneId)
                : [...selectedIds, zoneId]
        );
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {label}
                </label>
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={selectedIds.length === 0}
                        onChange={(e) => {
                            if (e.target.checked) onChange([]);
                        }}
                    />
                    {allZonesLabel}
                </label>
            </div>
            <div className="flex flex-wrap gap-2">
                {zones.map((z) => {
                    const isSelected = selectedIds.includes(z._id);
                    return (
                        <button
                            key={z._id}
                            type="button"
                            onClick={() => toggleZone(z._id)}
                            className={cn(
                                'px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all',
                                isSelected
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-white'
                            )}
                        >
                            {z.name}
                        </button>
                    );
                })}
                {zones.length === 0 && (
                    <span className="text-[11px] text-slate-400">No zones configured yet.</span>
                )}
            </div>
            <p className="text-[10px] text-slate-400">
                {selectedIds.length === 0 ? emptyHint : scopedHint}
            </p>
        </div>
    );
};

export default ZoneScopeSelector;
