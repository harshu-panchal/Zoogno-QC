import express from "express";
import {
    bootstrapAdmin,
    signupAdmin,
    loginAdmin,
    verifyAdminEmail,
    sendAdminOtp,
    verifyAdminOtp,
    ssoAdminLogin,
    refreshAdminToken
} from "../controller/adminAuthController.js";
import {
    getAdminProfile,
    updateAdminProfile,
    updateAdminPassword,
    getAdminStats,
    getDeliveryPartners,
    approveDeliveryPartner,
    rejectDeliveryPartner,
    getActiveFleet,
    getAdminWalletData,
    getDeliveryTransactions,
    settleTransaction,
    bulkSettleDelivery,
    getActiveSellers,
    getPendingSellers,
    approveSellerApplication,
    rejectSellerApplication,
    getSellerWithdrawals,
    getDeliveryWithdrawals,
    updateWithdrawalStatus,
    getSellerTransactions,
    getDeliveryCashBalances,
    getRiderCashDetails,
    settleRiderCash,
    getCashSettlementHistory,
    getUsers,
    getUserById,
    getSellers,
    getSellerLocations,
    getPlatformSettings,
    updatePlatformSettings
} from "../controller/adminController.js";
import {
    exportAdminFinanceStatementController,
    getAdminFinanceLedgerController,
    getAdminFinancePayoutsController,
    getAdminFinanceSummaryController,
    getDeliverySettingsController,
    processAdminFinancePayoutsController,
    updateDeliverySettingsController,
} from "../controller/adminFinanceController.js";
import qrBagsAdminRoutes from "./qrBagsAdminRoutes.js";
import basketsAdminRoutes from "./basketsAdminRoutes.js";
import {
    createSlot,
    getSlots,
    updateSlot,
    deleteSlot,
    getOnlineDrivers,
    forceOfflineDriver,
    getSlotAnalytics
} from "../controller/admin/slotMasterController.js";

import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";
import {
    adminBootstrapRateLimiter,
    authRouteRateLimiter,
    createContentLengthGuard,
} from "../middleware/securityMiddlewares.js";

const router = express.Router();

const smallAdminPayload = createContentLengthGuard(
    parseInt(process.env.ADMIN_AUTH_MAX_PAYLOAD_BYTES || "20480", 10),
    "Admin auth payload too large",
);
router.post("/bootstrap", adminBootstrapRateLimiter, smallAdminPayload, bootstrapAdmin);
router.post("/signup", adminBootstrapRateLimiter, smallAdminPayload, signupAdmin);
router.post("/login", authRouteRateLimiter, smallAdminPayload, loginAdmin);
router.post("/refresh-token", authRouteRateLimiter, smallAdminPayload, refreshAdminToken);

// New Auth Flows
router.get("/verify-email", adminBootstrapRateLimiter, verifyAdminEmail);
router.post("/send-otp", authRouteRateLimiter, smallAdminPayload, sendAdminOtp);
router.post("/verify-otp", authRouteRateLimiter, smallAdminPayload, verifyAdminOtp);
router.post("/sso-login", authRouteRateLimiter, smallAdminPayload, ssoAdminLogin);

// QR Bags
router.use("/qr-bags", qrBagsAdminRoutes);

// Baskets (Bulky Orders)
router.use("/baskets", basketsAdminRoutes);

// Profile routes
router.get(
    "/profile",
    verifyToken,
    allowRoles("admin"),
    getAdminProfile
);

router.put(
    "/profile",
    verifyToken,
    allowRoles("admin"),
    updateAdminProfile
);

router.put(
    "/profile/password",
    verifyToken,
    allowRoles("admin"),
    updateAdminPassword
);

router.get(
    "/stats",
    verifyToken,
    allowRoles("admin"),
    getAdminStats
);
router.get(
    "/finance/summary",
    verifyToken,
    allowRoles("admin"),
    getAdminFinanceSummaryController,
);
router.get(
    "/finance/ledger",
    verifyToken,
    allowRoles("admin"),
    getAdminFinanceLedgerController,
);
router.get(
    "/finance/payouts",
    verifyToken,
    allowRoles("admin"),
    getAdminFinancePayoutsController,
);
router.post(
    "/finance/payouts/process",
    verifyToken,
    allowRoles("admin"),
    processAdminFinancePayoutsController,
);
router.get(
    "/finance/export-statement",
    verifyToken,
    allowRoles("admin"),
    exportAdminFinanceStatementController,
);
router.get(
    "/settings/platform",
    verifyToken,
    allowRoles("admin"),
    getPlatformSettings
);
router.get(
    "/settings/delivery",
    verifyToken,
    allowRoles("admin"),
    getDeliverySettingsController,
);
router.put(
    "/settings/delivery",
    verifyToken,
    allowRoles("admin"),
    updateDeliverySettingsController,
);
router.put(
    "/settings/platform",
    verifyToken,
    allowRoles("admin"),
    updatePlatformSettings
);
router.get("/users", verifyToken, allowRoles("admin"), getUsers);
router.get("/users/:id", verifyToken, allowRoles("admin"), getUserById);
router.get("/sellers", verifyToken, allowRoles("admin"), getSellers);
router.get("/sellers/locations", verifyToken, allowRoles("admin"), getSellerLocations);
router.get("/sellers/active", verifyToken, allowRoles("admin"), getActiveSellers);
router.get("/sellers/pending", verifyToken, allowRoles("admin"), getPendingSellers);
router.patch("/sellers/approve/:id", verifyToken, allowRoles("admin"), approveSellerApplication);
router.delete("/sellers/reject/:id", verifyToken, allowRoles("admin"), rejectSellerApplication);

router.get(
    "/delivery-partners",
    verifyToken,
    allowRoles("admin"),
    getDeliveryPartners
);

router.patch(
    "/delivery-partners/approve/:id",
    verifyToken,
    allowRoles("admin"),
    approveDeliveryPartner
);

router.delete(
    "/delivery-partners/reject/:id",
    verifyToken,
    allowRoles("admin"),
    rejectDeliveryPartner
);

router.get("/active-fleet", verifyToken, allowRoles("admin"), getActiveFleet);
router.get("/wallet-data", verifyToken, allowRoles("admin"), getAdminWalletData);

// Delivery Payouts / Funds
router.get("/delivery-transactions", verifyToken, allowRoles('admin'), getDeliveryTransactions);
router.put("/transactions/:id/settle", verifyToken, allowRoles("admin"), settleTransaction);
router.put("/transactions/bulk-settle-delivery", verifyToken, allowRoles("admin"), bulkSettleDelivery);

// Cash Collection Hub
router.get("/delivery-cash", verifyToken, allowRoles("admin"), getDeliveryCashBalances);
router.get("/rider-cash-details/:id", verifyToken, allowRoles("admin"), getRiderCashDetails);
router.post("/settle-cash", verifyToken, allowRoles("admin"), settleRiderCash);
router.get("/cash-history", verifyToken, allowRoles("admin"), getCashSettlementHistory);

// Seller Withdrawal Management
router.get("/seller-withdrawals", verifyToken, allowRoles("admin"), getSellerWithdrawals);
router.get("/delivery-withdrawals", verifyToken, allowRoles("admin"), getDeliveryWithdrawals);
router.get("/seller-transactions", verifyToken, allowRoles("admin"), getSellerTransactions);
router.put("/withdrawals/:id", verifyToken, allowRoles("admin"), updateWithdrawalStatus);



import {
    getAdmins,
    sendInviteOtp,
    inviteAdminUser,
    toggleAdminStatus,
    verifyInviteOtp,
    updateStaffPermissions
} from "../controller/adminStaffController.js";

// Protected admin route example
router.get(
    "/dashboard",
    verifyToken,
    allowRoles("admin"),
    (req, res) => {
        res.json({
            success: true,
            message: "Welcome to Admin Dashboard",
        });
    }
);


// Admin Staff Management Routes
router.get("/staff", verifyToken, allowRoles("admin"), getAdmins);
router.post("/staff/send-invite-otp", verifyToken, allowRoles("admin"), sendInviteOtp);
router.post("/staff/verify-otp", verifyToken, allowRoles("admin"), verifyInviteOtp);
router.post("/staff/invite", verifyToken, allowRoles("admin"), inviteAdminUser);
router.put("/staff/:id/status", verifyToken, allowRoles("admin"), toggleAdminStatus);
router.put("/staff/:id/permissions", verifyToken, allowRoles("admin"), updateStaffPermissions);

// Slot Management Routes
router.post("/slots", verifyToken, allowRoles("admin"), createSlot);
router.get("/slots", verifyToken, allowRoles("admin"), getSlots);
router.put("/slots/:id", verifyToken, allowRoles("admin"), updateSlot);
router.delete("/slots/:id", verifyToken, allowRoles("admin"), deleteSlot);
router.get("/online-drivers", verifyToken, allowRoles("admin"), getOnlineDrivers);
router.post("/drivers/:id/force-offline", verifyToken, allowRoles("admin"), forceOfflineDriver);
router.get("/slots-analytics", verifyToken, allowRoles("admin"), getSlotAnalytics);

export default router;
