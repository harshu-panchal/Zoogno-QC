import axiosInstance from '@core/api/axios';

/**
 * Penalty management (admin): order investigation, apply / revoke, history.
 */
export const adminPenaltyApi = {
    getOrderInvestigation: (orderId) =>
        axiosInstance.get(`/penalties/admin/investigation/${encodeURIComponent(orderId)}`),
    getPenaltyBeneficiaryOrders: (params) =>
        axiosInstance.get('/penalties/admin/beneficiary-orders', { params }),
    applyPenalty: (data) => axiosInstance.post('/penalties/admin', data),
    getPenalties: (params) => axiosInstance.get('/penalties/admin', { params }),
    getPenalty: (id) => axiosInstance.get(`/penalties/admin/${id}`),
    revokePenalty: (id, data) => axiosInstance.post(`/penalties/admin/${id}/revoke`, data),
};
