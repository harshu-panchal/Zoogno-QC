import axiosInstance from '@core/api/axios';

/**
 * QR Paper Bag API — Admin endpoints
 *
 * All backend routes prefixed /admin/qr-bags
 */
export const adminQRBagsApi = {
    // ── Inventory ────────────────────────────────────────────────────────────
    /** GET  /admin/qr-bags — paginated bag inventory */
    getInventory: (params) => axiosInstance.get('/admin/qr-bags', { params }),

    /** GET  /admin/qr-bags/:bagId — single bag details + timeline */
    getBagDetails: (bagId) => axiosInstance.get(`/admin/qr-bags/${bagId}`),

    /** GET  /admin/qr-bags/:bagId/timeline */
    getBagTimeline: (bagId) => axiosInstance.get(`/admin/qr-bags/${bagId}/timeline`),

    // ── Generation ───────────────────────────────────────────────────────────
    /** POST /admin/qr-bags/generate  { quantity, size, notes } */
    generateBags: (data) => axiosInstance.post('/admin/qr-bags/generate', data),

    /** GET  /admin/qr-bags/:bagId/qr-image — server-rendered QR PNG */
    getBagQRImage: (bagId) => axiosInstance.get(`/admin/qr-bags/${bagId}/qr-image`),

    /** PUT  /admin/qr-bags/:bagId/reprint — mark as reprinted */
    reprintBag: (bagId) => axiosInstance.put(`/admin/qr-bags/${bagId}/reprint`),

    // ── Disable ──────────────────────────────────────────────────────────────
    /** PUT  /admin/qr-bags/:bagId/disable */
    disableBag: (bagId) => axiosInstance.put(`/admin/qr-bags/${bagId}/disable`),

    /** PUT  /admin/qr-bags/:bagId/enable */
    enableBag: (bagId) => axiosInstance.put(`/admin/qr-bags/${bagId}/enable`),

    // ── Assignment ───────────────────────────────────────────────────────────
    /** POST /admin/qr-bags/assign  { sellerId, bagIds: [] } */
    assignBagsToSeller: (data) => axiosInstance.post('/admin/qr-bags/assign', data),

    /** GET  /admin/qr-bags/seller/:sellerId — bags assigned to a seller */
    getSellerBags: (sellerId, params) =>
        axiosInstance.get(`/admin/qr-bags/seller/${sellerId}`, { params }),

    /** GET  /admin/sellers — list all sellers (for assignment page) */
    getSellers: (params) => axiosInstance.get('/admin/sellers', { params }),

    // ── Bag Requests (from sellers) ───────────────────────────────────────────
    /** GET  /admin/qr-bags/requests */
    getBagRequests: (params) => axiosInstance.get('/admin/qr-bags/requests', { params }),

    /** GET  /admin/qr-bags/requests/pending-count */
    getPendingRequestsCount: () => axiosInstance.get('/admin/qr-bags/requests/pending-count'),

    /** PUT  /admin/qr-bags/requests/:id/approve  { quantity, size } */
    approveRequest: (id, data) => axiosInstance.put(`/admin/qr-bags/requests/${id}/approve`, data),

    /** PUT  /admin/qr-bags/requests/:id/reject  { reason } */
    rejectRequest: (id, data) => axiosInstance.put(`/admin/qr-bags/requests/${id}/reject`, data),

    // ── Hub Scan ─────────────────────────────────────────────────────────────
    /** POST /admin/qr-bags/hub-scan  { bagId } */
    scanHubBag: (data) => axiosInstance.post('/admin/qr-bags/hub-scan', data),
    /** alias for scanHubBag (used in QRHubScan page) */
    hubScanBag: (data) => axiosInstance.post('/admin/qr-bags/hub-scan', data),

    /** GET  /admin/qr-bags/hub-scan/today — today's hub scan log */
    getTodayHubScans: (params) => axiosInstance.get('/admin/qr-bags/hub-scan/today', { params }),

    // ── Lost Bags ────────────────────────────────────────────────────────────
    /** GET  /admin/qr-bags/lost */
    getLostBags: (params) => axiosInstance.get('/admin/qr-bags/lost', { params }),

    /** POST /admin/qr-bags/lost  { bagId, reason, notes } */
    markBagLost: (data) => axiosInstance.post('/admin/qr-bags/lost', data),

    // ── Billing ──────────────────────────────────────────────────────────────
    /** GET  /admin/qr-bags/billing */
    getBillingRecords: (params) => axiosInstance.get('/admin/qr-bags/billing', { params }),

    /** PUT  /admin/qr-bags/billing/:id/mark-paid */
    markBillPaid: (id) => axiosInstance.put(`/admin/qr-bags/billing/${id}/mark-paid`),

    /** PUT  /admin/qr-bags/billing/:id/waive */
    waiveBill: (id) => axiosInstance.put(`/admin/qr-bags/billing/${id}/waive`),

    /** GET  /admin/qr-bags/billing/summary — aggregate stats */
    getBillingSummary: () => axiosInstance.get('/admin/qr-bags/billing/summary'),
};
