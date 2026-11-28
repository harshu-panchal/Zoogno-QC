import axiosInstance from '@core/api/axios';

export const adminBestOffersApi = {
    getZoneListings: (zoneId) => axiosInstance.get(`/best-offers/admin/zone/${zoneId}`),
    saveZoneOrder: (zoneId, sellerIds) =>
        axiosInstance.put(`/best-offers/admin/zone/${zoneId}/order`, { sellerIds }),
    setVisibility: (sellerId, adminStatus) =>
        axiosInstance.patch(`/best-offers/admin/listings/${sellerId}/visibility`, { adminStatus }),
    updateOfferConfig: (sellerId, data) =>
        axiosInstance.patch(`/best-offers/admin/listings/${sellerId}/config`, data),
    updateGuardrails: (data) =>
        axiosInstance.patch(`/best-offers/admin/guardrails`, data),
};
