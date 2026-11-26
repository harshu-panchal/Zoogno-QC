import axiosInstance from '@core/api/axios';

export const sellerBestOffersApi = {
    getMine: () => axiosInstance.get('/best-offers/seller/me'),
    saveMine: (data) => axiosInstance.put('/best-offers/seller/me', data),
    uploadMedia: (formData) =>
        axiosInstance.post('/media/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};
