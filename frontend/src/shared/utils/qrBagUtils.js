/**
 * QR Paper Bag Utilities
 * Shared helpers for QR generation, label printing, bag ID formatting,
 * and status color mapping used across Admin, Seller, and Delivery panels.
 */
import QRCode from 'qrcode';
import jsPDF from 'jspdf';

// ─── Bag ID Formatting ───────────────────────────────────────────────────────

/**
 * Format a numeric bag index into a standardised Bag ID string.
 * e.g. formatBagId(42) => "BAG-00042"
 */
export const formatBagId = (index) =>
    `BAG-${String(index).padStart(5, '0')}`;

/**
 * Generate a unique Bag ID using timestamp + random suffix for client-side
 * generation before the server persists it.
 */
export const generateTempBagId = () => {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `BAG-${ts}-${rand}`;
};

// ─── QR Code Generation ──────────────────────────────────────────────────────

/**
 * Generate a QR code as a data URL (PNG) for a given bagId.
 * @param {string} bagId
 * @param {object} [opts] - Options passed to qrcode library
 * @returns {Promise<string>} data URL string
 */
export const generateBagQRDataURL = async (bagId, opts = {}) => {
    return QRCode.toDataURL(bagId, {
        width: 256,
        margin: 2,
        errorCorrectionLevel: 'H',
        color: {
            dark: '#000000',
            light: '#ffffff',
        },
        ...opts,
    });
};

/**
 * Batch-generate QR data URLs for an array of bag IDs.
 * Returns array of { bagId, dataUrl } objects.
 * @param {string[]} bagIds
 * @param {Function} [onProgress] - Called with (done, total) during processing
 */
export const generateBagQRBatch = async (bagIds, onProgress) => {
    const results = [];
    for (let i = 0; i < bagIds.length; i++) {
        const bagId = bagIds[i];
        const dataUrl = await generateBagQRDataURL(bagId);
        results.push({ bagId, dataUrl });
        if (onProgress) onProgress(i + 1, bagIds.length);
    }
    return results;
};

// ─── Status Helpers ──────────────────────────────────────────────────────────

const BAG_STATUS_CONFIG = {
    AVAILABLE: {
        label: 'Available',
        badge: 'bg-emerald-100 text-emerald-700',
        dot: 'bg-emerald-500',
    },
    ASSIGNED: {
        label: 'Assigned',
        badge: 'bg-blue-100 text-blue-700',
        dot: 'bg-blue-500',
    },
    IN_USE: {
        label: 'In Use',
        badge: 'bg-amber-100 text-amber-700',
        dot: 'bg-amber-500',
    },
    PACKED: {
        label: 'Packed',
        badge: 'bg-purple-100 text-purple-700',
        dot: 'bg-purple-500',
    },
    HUB_SCANNED: {
        label: 'Hub Scanned',
        badge: 'bg-indigo-100 text-indigo-700',
        dot: 'bg-indigo-500',
    },
    PICKED_UP: {
        label: 'Picked Up',
        badge: 'bg-orange-100 text-orange-700',
        dot: 'bg-orange-500',
    },
    DELIVERED: {
        label: 'Delivered',
        badge: 'bg-green-100 text-green-700',
        dot: 'bg-green-500',
    },
    RETURNED: {
        label: 'Returned',
        badge: 'bg-slate-100 text-slate-600',
        dot: 'bg-slate-400',
    },
    LOST: {
        label: 'Lost',
        badge: 'bg-red-100 text-red-700',
        dot: 'bg-red-500',
    },
    DISABLED: {
        label: 'Disabled',
        badge: 'bg-gray-100 text-gray-500',
        dot: 'bg-gray-400',
    },
};

export const getBagStatusConfig = (status) =>
    BAG_STATUS_CONFIG[status?.toUpperCase()] || {
        label: status || 'Unknown',
        badge: 'bg-gray-100 text-gray-600',
        dot: 'bg-gray-400',
    };

const REQUEST_STATUS_CONFIG = {
    PENDING: { label: 'Pending', badge: 'bg-amber-100 text-amber-700' },
    APPROVED: { label: 'Approved', badge: 'bg-blue-100 text-blue-700' },
    FULFILLED: { label: 'Fulfilled', badge: 'bg-green-100 text-green-700' },
    REJECTED: { label: 'Rejected', badge: 'bg-red-100 text-red-700' },
};

export const getRequestStatusConfig = (status) =>
    REQUEST_STATUS_CONFIG[status?.toUpperCase()] || {
        label: status || 'Unknown',
        badge: 'bg-gray-100 text-gray-600',
    };

const PRIORITY_CONFIG = {
    LOW: { label: 'Low', badge: 'bg-slate-100 text-slate-600' },
    MEDIUM: { label: 'Medium', badge: 'bg-blue-100 text-blue-700' },
    HIGH: { label: 'High', badge: 'bg-orange-100 text-orange-700' },
    URGENT: { label: 'Urgent', badge: 'bg-red-100 text-red-700' },
};

export const getPriorityConfig = (priority) =>
    PRIORITY_CONFIG[priority?.toUpperCase()] || {
        label: priority || 'Normal',
        badge: 'bg-gray-100 text-gray-600',
    };

// ─── Label Printing (jsPDF) ──────────────────────────────────────────────────

/**
 * Print a delivery label as a PDF for the given order and bag data.
 * @param {{ orderId, bagId, customerName, paymentMethod, total }} labelData
 * @param {string} qrDataUrl - Base64 QR image data URL
 */
export const printBagLabel = async (labelData, qrDataUrl) => {
    const {
        orderId = 'N/A',
        bagId = 'N/A',
        customerName = 'Customer',
        paymentMethod = 'PREPAID',
        total = 0,
    } = labelData;

    const isCOD =
        paymentMethod?.toLowerCase() === 'cod' ||
        paymentMethod?.toLowerCase() === 'cash';

    // 3x4 inch label at 72 dpi
    const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [76, 101],
    });

    // Background
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, 76, 101, 'F');

    // Header bar
    pdf.setFillColor(30, 30, 30);
    pdf.rect(0, 0, 76, 14, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text('ZOOGNU DELIVERY', 38, 5.5, { align: 'center' });
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Quick Commerce', 38, 10, { align: 'center' });

    // QR Code
    if (qrDataUrl) {
        pdf.addImage(qrDataUrl, 'PNG', 23, 16, 30, 30);
    }

    // Bag ID
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(30, 30, 30);
    pdf.text(bagId, 38, 50, { align: 'center' });

    // Divider
    pdf.setDrawColor(220, 220, 220);
    pdf.line(4, 54, 72, 54);

    // Order ID
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    pdf.setTextColor(100, 100, 100);
    pdf.text('ORDER ID', 4, 59);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(30, 30, 30);
    pdf.text(`#${orderId}`, 4, 64);

    // Customer Name
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    pdf.setTextColor(100, 100, 100);
    pdf.text('CUSTOMER', 4, 71);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(30, 30, 30);
    const truncName =
        customerName.length > 22
            ? customerName.substring(0, 22) + '…'
            : customerName;
    pdf.text(truncName, 4, 76);

    // Payment badge
    const badgeX = isCOD ? 4 : 4;
    const badgeColor = isCOD ? [255, 140, 0] : [34, 197, 94];
    pdf.setFillColor(...badgeColor);
    pdf.roundedRect(badgeX, 80, isCOD ? 26 : 26, 8, 2, 2, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.text(isCOD ? `COD ₹${total}` : 'PREPAID', badgeX + (isCOD ? 13 : 13), 85.5, {
        align: 'center',
    });

    // Footer
    pdf.setFillColor(245, 245, 245);
    pdf.rect(0, 93, 76, 8, 'F');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(5.5);
    pdf.setTextColor(120, 120, 120);
    pdf.text('Handle with care. Do not open until delivered.', 38, 98, {
        align: 'center',
    });

    pdf.save(`label-${bagId}-${orderId}.pdf`);
};

// ─── Bag Scan Validation ─────────────────────────────────────────────────────

/**
 * Validate a scanned QR bag value before sending to server.
 * Returns { valid: boolean, error?: string }
 */
export const validateScannedBagId = (scannedValue) => {
    if (!scannedValue || typeof scannedValue !== 'string') {
        return { valid: false, error: 'No bag ID detected.' };
    }
    const trimmed = scannedValue.trim();
    if (trimmed.length < 3) {
        return { valid: false, error: 'Scanned value too short to be a valid Bag ID.' };
    }
    return { valid: true, bagId: trimmed };
};

// ─── Bag Timeline Helpers ────────────────────────────────────────────────────

export const BAG_TIMELINE_STEPS = [
    { key: 'generated', label: 'QR Generated', icon: '🏷️' },
    { key: 'assigned', label: 'Assigned to Seller', icon: '🏪' },
    { key: 'packed', label: 'Order Packed', icon: '📦' },
    { key: 'hub_scanned', label: 'Hub Scanned', icon: '🏭' },
    { key: 'picked_up', label: 'Driver Pickup', icon: '🚗' },
    { key: 'delivered', label: 'Delivered to Customer', icon: '✅' },
    { key: 'billing', label: 'Billing Generated', icon: '💰' },
];
