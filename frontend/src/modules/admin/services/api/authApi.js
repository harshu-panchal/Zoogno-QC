import axiosInstance from '@core/api/axios';

/**
 * Admin authentication and profile endpoints.
 *
 * Part of the per-domain split introduced in refactor P4.5. The aggregate
 * `adminApi` object continues to expose these via re-export at
 * `../adminApi.js`, so existing imports continue to work unchanged.
 */
export const adminAuthApi = {
    login: (data) => axiosInstance.post('/admin/login', data),
    signup: (data) => axiosInstance.post('/admin/signup', data),
    getProfile: () => axiosInstance.get('/admin/profile'),
    updateProfile: (data) => axiosInstance.put('/admin/profile', data),
    updatePassword: (data) => axiosInstance.put('/admin/profile/password', data),
    // New Auth Flows
    verifyEmail: (token) => axiosInstance.get(`/admin/verify-email?token=${token}`),
    sendOtp: (data) => axiosInstance.post('/admin/send-otp', data),
    verifyOtp: (data) => axiosInstance.post('/admin/verify-otp', data),
    ssoLogin: (data) => axiosInstance.post('/admin/sso-login', data),
    
    // Staff Management
    getStaff: () => axiosInstance.get('/admin/staff'),
    sendInviteOtp: (data) => axiosInstance.post('/admin/staff/send-invite-otp', data),
    verifyInviteOtp: (data) => axiosInstance.post('/admin/staff/verify-otp', data),
    inviteStaff: (data) => axiosInstance.post('/admin/staff/invite', data),
    toggleStaffStatus: (id, data) => axiosInstance.put(`/admin/staff/${id}/status`, data),
    updateStaffPermissions: (id, data) => axiosInstance.put(`/admin/staff/${id}/permissions`, data),
};

export default adminAuthApi;
