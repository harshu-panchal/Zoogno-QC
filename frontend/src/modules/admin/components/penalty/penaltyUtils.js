export const PENALTY_REASONS = [
    { value: 'PRODUCT_DAMAGED', label: 'Product damaged' },
    { value: 'CONDITION_MISMATCH', label: 'Product condition does not match condition at dispatch' },
    { value: 'DAMAGED_IN_DELIVERY', label: 'Product damaged during delivery' },
    { value: 'WRONG_PRODUCT', label: 'Wrong product' },
    { value: 'MISSING_PRODUCT', label: 'Missing product' },
    { value: 'LATE_OR_UNPROFESSIONAL', label: 'Late / unprofessional conduct' },
    { value: 'OTHER', label: 'Other (add a note)' },
];

export const reasonLabel = (value) =>
    PENALTY_REASONS.find((r) => r.value === value)?.label || value || '—';

export const ISSUE_TYPE_LABEL = {
    PRODUCT_DAMAGED: 'Product damaged',
    CONDITION_MISMATCH: 'Condition not as expected',
    DAMAGED_IN_DELIVERY: 'Damaged during delivery',
    WRONG_PRODUCT: 'Wrong product',
    MISSING_PRODUCT: 'Missing product',
    SELLER_ISSUE: 'Seller issue',
    DELIVERY_ISSUE: 'Delivery partner issue',
    OTHER: 'Other',
};

export const EVIDENCE_KIND_LABEL = {
    SELLER_DISPATCH: 'Seller (at dispatch)',
    RIDER_PICKUP: 'Delivery partner (at pickup)',
    CUSTOMER_RETURN: 'Customer (return request)',
    CUSTOMER_TICKET: 'Customer (support ticket)',
    RETURN_PICKUP: 'Return pickup (rider)',
};

export const money = (value) =>
    `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const fmtDateTime = (value) =>
    value
        ? new Date(value).toLocaleString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
          })
        : '—';

/** Flattens every photo that can be attached to a penalty from an investigation bundle. */
export const collectEvidenceItems = (inv) => {
    if (!inv) return [];
    const out = [];
    const seen = new Set();
    const push = (kind, url, caption) => {
        if (!url || seen.has(url)) return;
        seen.add(url);
        out.push({ kind, url, caption: caption || '' });
    };
    (inv.sellerEvidence?.images || []).forEach((i) => push('SELLER_DISPATCH', i.url, i.productName));
    (inv.riderEvidence?.images || []).forEach((i) => push('RIDER_PICKUP', i.url, i.productName));
    (inv.returnInfo?.images || []).forEach((u) => push('CUSTOMER_RETURN', u));
    (inv.returnInfo?.pickupImages || []).forEach((u) => push('RETURN_PICKUP', u));
    (inv.tickets || []).forEach((t) => {
        (t.attachments || []).forEach((u) => push('CUSTOMER_TICKET', u, t.subject));
        (t.media || []).forEach((m) => push('CUSTOMER_TICKET', m.url, t.subject));
    });
    return out;
};
