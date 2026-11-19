/**
 * Pure helpers for the seller Orders list (kept free of React / path aliases so they can be
 * unit-tested in plain Node).
 *
 * Why this exists: the Orders page loads ONE server page at a time (20 orders), but used to apply
 * its search box and status tabs only to that loaded page - so searching for, or opening the
 * "Delivered" tab of, an order that was not on the current page showed nothing. Both now go to the
 * server; these helpers translate what the UI shows into what the API understands.
 */

/**
 * UI tab -> the `status` value GET /orders/seller-orders understands. The API's "processed" covers
 * BOTH confirmed and packed, so those two tabs share it and the page then narrows to the exact tab.
 * Returns undefined for "All" (no status filter).
 */
export function sellerOrderStatusParam(tab) {
  switch (String(tab || '').toLowerCase()) {
    case 'pending': return 'pending';
    case 'confirmed':
    case 'packed': return 'processed';
    case 'out for delivery':
    case 'out_for_delivery': return 'out-for-delivery';
    case 'delivered': return 'delivered';
    case 'cancelled': return 'cancelled';
    default: return undefined;
  }
}

/** The status string orders carry, for the exact-tab check on top of the coarse server filter. */
export function sellerOrderTabStatus(tab) {
  const t = String(tab || '').toLowerCase();
  if (t === 'all' || t === '') return null;
  return t === 'out for delivery' ? 'out_for_delivery' : t;
}

/** Does this order belong under the tab? (`order.status` is the lower-case status string.) */
export function orderMatchesSellerTab(order, tab) {
  const wanted = sellerOrderTabStatus(tab);
  if (!wanted) return true;
  return String(order?.status || '').toLowerCase() === wanted;
}

/**
 * Query params for the seller orders request. Empty values are omitted so they never reach the URL.
 */
export function buildSellerOrderParams({ page = 1, search = '', tab = 'All', startDate = '', endDate = '' } = {}) {
  const params = { page };
  const term = String(search || '').trim();
  if (term) params.search = term;
  const status = sellerOrderStatusParam(tab);
  if (status) params.status = status;
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  return params;
}
