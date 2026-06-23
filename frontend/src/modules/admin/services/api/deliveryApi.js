import axiosInstance from '@core/api/axios';

/**
 * Admin delivery-partner endpoints (lifecycle, active fleet).
 * Per-domain split (P4.5).
 */
export const adminDeliveryApi = {
    getDeliveryPartners: (params) =>
        axiosInstance.get('/admin/delivery-partners', { params }),
    approveDeliveryPartner: (id) =>
        axiosInstance.patch(`/admin/delivery-partners/approve/${id}`),
    rejectDeliveryPartner: (id) =>
        axiosInstance.delete(`/admin/delivery-partners/reject/${id}`),
    getActiveFleet: (params) =>
        axiosInstance.get('/admin/active-fleet', { params }),
    getSlots: () => axiosInstance.get('/admin/slots'),
    createSlot: (data) => axiosInstance.post('/admin/slots', data),
    updateSlot: (id, data) => axiosInstance.put(`/admin/slots/${id}`, data),
    deleteSlot: (id) => axiosInstance.delete(`/admin/slots/${id}`),
    getOnlineDrivers: () => axiosInstance.get('/admin/online-drivers'),
    forceOfflineDriver: (id) => axiosInstance.post(`/admin/drivers/${id}/force-offline`),
    getSlotAnalytics: () => axiosInstance.get('/admin/slots-analytics'),
};

export default adminDeliveryApi;
