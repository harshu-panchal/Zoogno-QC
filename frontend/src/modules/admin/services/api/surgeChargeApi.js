import axiosInstance from '@core/api/axios';

export const adminSurgeChargeApi = {
    getAllSurgeChargeRules: (params) =>
        axiosInstance.get('/admin/surge-charges', { params }),
    
    getSurgeChargeRule: (id) =>
        axiosInstance.get(`/admin/surge-charges/${id}`),

    createSurgeChargeRule: (data) =>
        axiosInstance.post('/admin/surge-charges', data),
    
    updateSurgeChargeRule: (id, data) =>
        axiosInstance.put(`/admin/surge-charges/${id}`, data),
    
    deleteSurgeChargeRule: (id) =>
        axiosInstance.delete(`/admin/surge-charges/${id}`),
};

export default adminSurgeChargeApi;
