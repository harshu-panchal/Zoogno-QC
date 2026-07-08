/**
 * Basket Utilities — Status configuration, validation, and helpers
 * for the Bulky Order Basket system.
 */

// ── Status Constants ────────────────────────────────────────────────────────
export const BASKET_STATUSES = {
    AVAILABLE: 'AVAILABLE',
    ASSIGNED: 'ASSIGNED',
    IN_USE: 'IN_USE',
    PACKED: 'PACKED',
    PICKED_UP: 'PICKED_UP',
    IN_TRANSIT: 'IN_TRANSIT',
    DELIVERED: 'DELIVERED',
    RETURNED: 'RETURNED',
    LOST: 'LOST',
    DAMAGED: 'DAMAGED',
    DISABLED: 'DISABLED',
};

// ── Status UI Configuration ─────────────────────────────────────────────────
const STATUS_CONFIG = {
    AVAILABLE: { label: 'Available', badge: 'bg-emerald-100 text-emerald-700', color: 'emerald' },
    ASSIGNED: { label: 'Assigned', badge: 'bg-blue-100 text-blue-700', color: 'blue' },
    IN_USE: { label: 'In Use', badge: 'bg-amber-100 text-amber-700', color: 'amber' },
    PACKED: { label: 'Packed', badge: 'bg-violet-100 text-violet-700', color: 'violet' },
    PICKED_UP: { label: 'Picked Up', badge: 'bg-indigo-100 text-indigo-700', color: 'indigo' },
    IN_TRANSIT: { label: 'In Transit', badge: 'bg-cyan-100 text-cyan-700', color: 'cyan' },
    DELIVERED: { label: 'Delivered', badge: 'bg-emerald-100 text-emerald-700', color: 'emerald' },
    RETURNED: { label: 'Returned', badge: 'bg-slate-100 text-slate-700', color: 'slate' },
    LOST: { label: 'Lost', badge: 'bg-red-100 text-red-700', color: 'red' },
    DAMAGED: { label: 'Damaged', badge: 'bg-orange-100 text-orange-700', color: 'orange' },
    DISABLED: { label: 'Disabled', badge: 'bg-slate-200 text-slate-500', color: 'slate' },
};

/**
 * Returns UI configuration for a basket status.
 * @param {string} status
 * @returns {{ label: string, badge: string, color: string }}
 */
export const getBasketStatusConfig = (status) => {
    const upper = String(status || '').toUpperCase().replace(/-/g, '_');
    return STATUS_CONFIG[upper] || { label: status || 'Unknown', badge: 'bg-slate-100 text-slate-600', color: 'slate' };
};

// ── Basket ID Validation ────────────────────────────────────────────────────
/**
 * Validates and normalizes a scanned basket ID.
 * Expects format: BSK-XXXXXXXX (8 alphanumeric chars)
 * @param {string} raw — raw scanned string
 * @returns {{ valid: boolean, error?: string, basketId?: string }}
 */
export const validateScannedBasketId = (raw) => {
    if (!raw || typeof raw !== 'string') {
        return { valid: false, error: 'No basket ID scanned' };
    }

    const trimmed = raw.trim().toUpperCase();

    // Direct basket ID format
    if (/^BSK-[A-Z0-9]{6,12}$/.test(trimmed)) {
        return { valid: true, basketId: trimmed };
    }

    // Try to extract from a URL (QR codes may encode URLs)
    const urlMatch = trimmed.match(/BSK-[A-Z0-9]{6,12}/);
    if (urlMatch) {
        return { valid: true, basketId: urlMatch[0] };
    }

    return { valid: false, error: `Invalid basket ID format: "${trimmed}". Expected BSK-XXXXXXXX.` };
};

// ── Basket Size Options ─────────────────────────────────────────────────────
export const BASKET_SIZES = [
    { value: 'SMALL', label: 'Small Basket', description: '30×20×15 cm — up to 5 kg', icon: '🧺' },
    { value: 'MEDIUM', label: 'Medium Basket', description: '45×30×25 cm — up to 15 kg', icon: '🧺' },
    { value: 'LARGE', label: 'Large Basket', description: '60×40×35 cm — up to 30 kg', icon: '🧺' },
];
