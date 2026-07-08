import axiosInstance from '@core/api/axios';

/**
 * Basket API — Admin endpoints for bulky order basket management.
 *
 * All backend routes prefixed /admin/baskets
 */
export const adminBasketsApi = {
    // ── Dashboard Stats ─────────────────────────────────────────────────────
    /** GET  /admin/baskets/stats — aggregate basket counts */
    getStats: () => axiosInstance.get('/admin/baskets/stats'),

    // ── Inventory ───────────────────────────────────────────────────────────
    /** GET  /admin/baskets — paginated basket inventory */
    getInventory: (params) => axiosInstance.get('/admin/baskets', { params }),

    /** GET  /admin/baskets/:basketId — single basket details + timeline */
    getBasketDetails: (basketId) => axiosInstance.get(`/admin/baskets/${basketId}`),

    /** GET  /admin/baskets/:basketId/timeline */
    getBasketTimeline: (basketId) => axiosInstance.get(`/admin/baskets/${basketId}/timeline`),

    // ── Creation ────────────────────────────────────────────────────────────
    /** POST /admin/baskets/create  { quantity, size, notes } */
    createBaskets: (data) => axiosInstance.post('/admin/baskets/create', data),

    // ── Assignment ──────────────────────────────────────────────────────────
    /** POST /admin/baskets/assign  { sellerId, basketIds: [], requestId? } */
    assignToSeller: (data) => axiosInstance.post('/admin/baskets/assign', data),

    /** GET  /admin/baskets/sellers — list sellers with basket counts */
    getSellers: (params) => axiosInstance.get('/admin/baskets/sellers', { params }),

    /** GET  /admin/baskets/seller/:sellerId — baskets assigned to a seller */
    getSellerBaskets: (sellerId, params) =>
        axiosInstance.get(`/admin/baskets/seller/${sellerId}`, { params }),

    // ── Status Updates ──────────────────────────────────────────────────────
    /** PUT  /admin/baskets/:basketId/disable */
    disableBasket: (basketId) => axiosInstance.put(`/admin/baskets/${basketId}/disable`),

    /** PUT  /admin/baskets/:basketId/enable */
    enableBasket: (basketId) => axiosInstance.put(`/admin/baskets/${basketId}/enable`),

    // ── Lost & Damaged ──────────────────────────────────────────────────────
    /** GET  /admin/baskets/lost-damaged — list lost/damaged baskets */
    getLostDamaged: (params) => axiosInstance.get('/admin/baskets/lost-damaged', { params }),

    /** POST /admin/baskets/mark-lost  { basketId, reason, notes } */
    markLost: (data) => axiosInstance.post('/admin/baskets/mark-lost', data),

    /** POST /admin/baskets/mark-damaged  { basketId, reason, notes } */
    markDamaged: (data) => axiosInstance.post('/admin/baskets/mark-damaged', data),

    // ── Requests ────────────────────────────────────────────────────────────
    /** GET /admin/baskets/requests */
    getBasketRequests: (params) => axiosInstance.get('/admin/baskets/requests', { params }),

    /** GET /admin/baskets/requests/pending-count */
    getPendingRequestsCount: () => axiosInstance.get('/admin/baskets/requests/pending-count'),

    /** PUT /admin/baskets/requests/:id/approve */
    approveRequest: (id, data) => axiosInstance.put(`/admin/baskets/requests/${id}/approve`, data),

    /** PUT /admin/baskets/requests/:id/reject */
    rejectRequest: (id, data) => axiosInstance.put(`/admin/baskets/requests/${id}/reject`, data),

    /** PUT /admin/baskets/requests/:id/dispatch */
    dispatchRequest: (id, data) => axiosInstance.put(`/admin/baskets/requests/${id}/dispatch`, data),

    /** PUT /admin/baskets/requests/:id/deliver */
    deliverRequest: (id) => axiosInstance.put(`/admin/baskets/requests/${id}/deliver`),
};
