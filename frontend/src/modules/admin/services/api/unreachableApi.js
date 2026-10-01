import axiosInstance from '@core/api/axios';

/**
 * Customer Unreachable module (admin): cases, charges, earnings.
 */
export const adminUnreachableApi = {
    getUnreachableCases: (params) =>
        axiosInstance.get('/customer-unreachable/admin/cases', { params }),
    getUnreachablePendingCount: () =>
        axiosInstance.get('/customer-unreachable/admin/cases/pending-count'),
    getUnreachableCase: (caseId) =>
        axiosInstance.get(`/customer-unreachable/admin/cases/${caseId}`),
    cancelUnreachableCase: (caseId, data) =>
        axiosInstance.post(`/customer-unreachable/admin/cases/${caseId}/cancel`, data),
    retryUnreachableCase: (caseId, data) =>
        axiosInstance.post(`/customer-unreachable/admin/cases/${caseId}/retry`, data),
    getUnreachableCharges: (params) =>
        axiosInstance.get('/customer-unreachable/admin/charges', { params }),
    waiveUnreachableCharge: (chargeId, data) =>
        axiosInstance.post(`/customer-unreachable/admin/charges/${chargeId}/waive`, data),
    getUnreachableEarnings: () =>
        axiosInstance.get('/customer-unreachable/admin/earnings'),
};
