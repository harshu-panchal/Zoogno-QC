import axiosInstance from '@core/api/axios';

export const sellerApi = {
    login: (data) => axiosInstance.post('/seller/login', data),
    signup: (data) => axiosInstance.post('/seller/signup', data),
    sendVerificationOtp: (data) => axiosInstance.post('/seller/verification/send-otp', data),
    verifyVerificationOtp: (data) => axiosInstance.post('/seller/verification/verify-otp', data),
    // Products
    getProducts: (params) => axiosInstance.get('/products/seller/me', { params }),
    generateSku: (name) => axiosInstance.get('/products/seller/generate-sku', { params: { name } }),
    getProductById: (id) => axiosInstance.get(`/products/${id}`),
    createProduct: (data) => axiosInstance.post('/products', data),
    updateProduct: (id, data) => axiosInstance.put(`/products/${id}`, data),
    deleteProduct: (id) => axiosInstance.delete(`/products/${id}`),
    getProductSettlementPreview: (data) => axiosInstance.post('/products/seller/settlement-preview', data),

    // Categories (Public)
    getCategories: () => axiosInstance.get('/admin/categories'),
    getCategoryTree: () => axiosInstance.get('/admin/categories?tree=true'),

    // Settings (Public)
    getSettings: () => axiosInstance.get('/settings'),
    getPublicPage: (slug) => axiosInstance.get(`/pages/public/${slug}`),

    // Store Status
    getStoreStatus: () => axiosInstance.get('/seller/store-status'),
    updateStoreStatus: (data) => axiosInstance.patch('/seller/store-status', data),

    // Others
    getStats: (range) => axiosInstance.get('/seller/stats', { params: { range } }),
    getOrders: (params) => axiosInstance.get('/orders/seller-orders', { params }),
    updateOrderStatus: (orderId, data) => axiosInstance.put(`/orders/status/${orderId}`, data),
    getEarnings: () => axiosInstance.get('/seller/earnings'),
    getWalletSummary: () => axiosInstance.get('/seller/wallet/summary'),
    getProfile: () => axiosInstance.get('/seller/profile'),
    updateProfile: (data) => axiosInstance.put('/seller/profile', data),
    uploadMedia: (formData) => axiosInstance.post('/media/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),

    // Stock
    adjustStock: (data) => axiosInstance.post('/products/adjust-stock', data),
    getStockHistory: () => axiosInstance.get('/products/stock-history'),

    // Notifications
    getNotifications: () => axiosInstance.get('/notifications'),
    markNotificationRead: (id) => axiosInstance.put(`/notifications/${id}/read`),
    markAllNotificationsRead: () => axiosInstance.put('/notifications/mark-all-read'),

    // Money Requests
    requestWithdrawal: (data) => axiosInstance.post('/seller/request-withdrawal', data),

    // Returns
    getReturns: (params) => axiosInstance.get('/orders/seller-returns', { params }),
    getReturnDetails: (orderId) => axiosInstance.get(`/orders/${orderId}/returns`),
    approveReturn: (orderId, data) => axiosInstance.put(`/orders/returns/${orderId}/approve`, data),
    rejectReturn: (orderId, data) => axiosInstance.put(`/orders/returns/${orderId}/reject`, data),
    assignReturnDelivery: (orderId, data) => axiosInstance.put(`/orders/returns/${orderId}/assign-delivery`, data),
    requestReturnDropOtp: (orderId) => axiosInstance.post(`/orders/workflow/${orderId}/return-drop-otp/request`),

    // QR Paper Bags
    requestBags: (data) => axiosInstance.post('/seller/bag-requests', data),
    getBagRequests: (params) => axiosInstance.get('/seller/bag-requests', { params }),
    getPendingBagRequestCount: () => axiosInstance.get('/seller/bag-requests/pending-count'),
    payForBagRequest: (id) => axiosInstance.post(`/seller/bag-requests/${id}/pay`),
    verifyBagPayment: (id) => axiosInstance.get(`/seller/bag-requests/${id}/verify`),
    getMyBags: (params) => axiosInstance.get('/seller/bags', { params }),
    validateBag: (bagId) => axiosInstance.get(`/seller/bags/${bagId}/validate`),
    scanAndAttachBag: (data) => axiosInstance.post('/seller/bags/attach', data),
    detachBag: (bagId) => axiosInstance.post(`/seller/bags/${bagId}/detach`),
    getLabelData: (orderId) => axiosInstance.get(`/seller/bags/label/${orderId}`),

    // Baskets (Bulky Orders)
    getBasketInventory: (params) => axiosInstance.get('/seller/baskets', { params }),
    validateBasket: (basketId) => axiosInstance.get(`/seller/baskets/${basketId}/validate`),
    scanAndAttachBasket: (data) => axiosInstance.post('/seller/baskets/attach', data),
    detachBasket: (basketId) => axiosInstance.post(`/seller/baskets/${basketId}/detach`),
    
    // Basket Requests & Inventory
    getBasketInventory: (params) => axiosInstance.get('/seller/baskets', { params }),
    getBasketRequests: (params) => axiosInstance.get('/seller/baskets/requests', { params }),
    createBasketRequest: (data) => axiosInstance.post('/seller/baskets/requests', data),
    getPendingBasketRequestCount: () => axiosInstance.get('/seller/baskets/requests/pending-count'),
    payForBasketRequest: (id) => axiosInstance.post(`/seller/baskets/requests/${id}/pay`),
    verifyBasketPayment: (id) => axiosInstance.post(`/seller/baskets/requests/${id}/verify-payment`),

    // Support Tickets
    createTicket: (data) => axiosInstance.post('/tickets/create', data),
    getMyTickets: () => axiosInstance.get('/tickets/my-tickets'),
    replyTicket: (id, text, options = {}) => axiosInstance.post(`/tickets/reply/${id}`, { text, ...options }),
};

