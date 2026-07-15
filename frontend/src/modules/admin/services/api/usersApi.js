import axiosInstance from '@core/api/axios';

/**
 * Admin user, seller, and reports endpoints.
 * Per-domain split (P4.5).
 */
export const adminUsersApi = {
    getDashboardStats: () => axiosInstance.get('/admin/stats'),
    getReports: () => axiosInstance.get('/admin/reports'),

    getUsers: (params) => axiosInstance.get('/admin/users', { params }),
    getUserById: (id) => axiosInstance.get(`/admin/users/${id}`),
    sendCustomerNotification: (id, message) => axiosInstance.post(`/admin/users/${id}/notify`, { message }),

    getSellers: (params) => axiosInstance.get('/admin/sellers', { params }),
    getActiveSellers: (params) =>
        axiosInstance.get('/admin/sellers/active', { params }),
    getSellerLocations: (params) =>
        axiosInstance.get('/admin/sellers/locations', { params }),
    getPendingSellers: (params) =>
        axiosInstance.get('/admin/sellers/pending', { params }),
    approveSeller: (id) => axiosInstance.patch(`/admin/sellers/approve/${id}`),
    rejectSeller: (id, data) =>
        axiosInstance.delete(`/admin/sellers/reject/${id}`, { data }),
    deleteSeller: (id) => axiosInstance.delete(`/admin/sellers/${id}`),
    forceToggleSellerStoreStatus: (id, data) => axiosInstance.patch(`/admin/sellers/${id}/store-status`, data),
    updateSellerStorefrontImage: (id, formData) => axiosInstance.patch(`/admin/sellers/${id}/storefront-image`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

export default adminUsersApi;
