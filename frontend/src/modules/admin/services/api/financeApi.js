import axiosInstance from '@core/api/axios';

/**
 * Admin finance, wallet, payouts, and cash-collection endpoints.
 * Per-domain split (P4.5).
 */
export const adminFinanceApi = {
    getAdminWalletData: (params) =>
        axiosInstance.get('/admin/wallet-data', { params }),

    getFinanceSummary: () => axiosInstance.get('/admin/finance/summary'),
    getFinanceLedger: (params) =>
        axiosInstance.get('/admin/finance/ledger', { params }),
    getFinancePayouts: (params) =>
        axiosInstance.get('/admin/finance/payouts', { params }),
    processFinancePayouts: (data) =>
        axiosInstance.post('/admin/finance/payouts/process', data),
    exportFinanceStatement: (params) =>
        axiosInstance.get('/admin/finance/export-statement', {
            params,
            responseType: 'blob',
        }),
    getAdminEarnings: (params) =>
        axiosInstance.get('/admin/finance/earnings', { params }),

    // Delivery payouts / funds
    getDeliveryTransactions: (params) =>
        axiosInstance.get('/admin/delivery-transactions', { params }),
    settleTransaction: (id) =>
        axiosInstance.put(`/admin/transactions/${id}/settle`),
    bulkSettleDelivery: () =>
        axiosInstance.put('/admin/transactions/bulk-settle-delivery'),

    // Seller / Delivery withdrawals
    getSellerWithdrawals: (params) =>
        axiosInstance.get('/admin/seller-withdrawals', { params }),
    getDeliveryWithdrawals: (params) =>
        axiosInstance.get('/admin/delivery-withdrawals', { params }),
    getSellerTransactions: (params) =>
        axiosInstance.get('/admin/seller-transactions', { params }),
    updateWithdrawalStatus: (id, data) =>
        axiosInstance.put(`/admin/withdrawals/${id}`, data),

    // Cash Collection Hub
    getDeliveryCashBalances: (params) =>
        axiosInstance.get('/admin/delivery-cash', { params }),
    getRiderCashDetails: (id) =>
        axiosInstance.get(`/admin/rider-cash-details/${id}`),
    settleRiderCash: (data) => axiosInstance.post('/admin/settle-cash', data),
    getCashSettlementHistory: (params) =>
        axiosInstance.get('/admin/cash-history', { params }),

    // GST Config (CA-configurable)
    getGstConfig: () =>
        axiosInstance.get('/admin/finance/gst/config'),
    updateGstConfig: (data) =>
        axiosInstance.put('/admin/finance/gst/config', data),

    // GST Transactions (raw ledger)
    getGstTransactions: (params) =>
        axiosInstance.get('/admin/finance/gst/transactions', { params }),

    // GST Report Downloads (individual CSVs)
    downloadGstReport: (reportType, params = {}) =>
        axiosInstance.get('/admin/finance/gst/download', {
            params: { reportType, ...params },
            responseType: 'blob',
        }),

    // CA Package (all CSVs as base64 JSON)
    downloadCaPackage: (params = {}) =>
        axiosInstance.get('/admin/finance/gst/download', {
            params: { reportType: 'ca_package', ...params },
        }),
};

export default adminFinanceApi;
