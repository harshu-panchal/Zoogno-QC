import axiosInstance from '@core/api/axios';

export const adminZonesApi = {
    getZones: () =>
        axiosInstance.get('/admin/zones'),
    
    createZone: (data) =>
        axiosInstance.post('/admin/zones', data),
    
    updateZone: (id, data) =>
        axiosInstance.put(`/admin/zones/${id}`, data),
    
    deleteZone: (id) =>
        axiosInstance.delete(`/admin/zones/${id}`),
};

export default adminZonesApi;
