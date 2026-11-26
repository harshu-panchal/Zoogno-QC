import express from "express";
import {
    signupSeller,
    loginSeller,
    sendSellerSignupOtp,
    verifySellerSignupOtp,
    refreshSellerToken,
    sendSellerForgotPasswordOtp,
    verifySellerForgotPasswordOtpController,
    resetSellerPassword,
    logoutSeller
} from "../controller/sellerAuthController.js";
import { getSellerProfile, updateSellerProfile, getNearbySellers, getStoreStatus, updateStoreStatus, getShopSchedule, updateShopSchedule, getActiveZonesForSeller, getStorefrontDetails, sendBankUpdateOtp, verifyBankUpdateOtp, downloadSellerGstReportController, listMyInvoicesController, getMyInvoiceController } from "../controller/sellerController.js";
import { getSellerStats, getSellerEarnings } from "../controller/sellerStatsController.js";
import { getSellerWalletSummaryController } from "../controller/adminFinanceController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";
import {
    authRouteRateLimiter,
    createContentLengthGuard,
    otpRouteRateLimiter,
} from "../middleware/securityMiddlewares.js";
import multer from "multer";
import qrBagsSellerRoutes from "./qrBagsSellerRoutes.js";
import basketsSellerRoutes from "./basketsSellerRoutes.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const sellerOtpPayloadGuard = createContentLengthGuard(
    parseInt(process.env.AUTH_MAX_PAYLOAD_BYTES || "16384", 10),
    "Verification payload too large",
);

router.post(
    "/verification/send-otp",
    authRouteRateLimiter,
    otpRouteRateLimiter,
    sellerOtpPayloadGuard,
    sendSellerSignupOtp
);
router.post(
    "/verification/verify-otp",
    authRouteRateLimiter,
    otpRouteRateLimiter,
    sellerOtpPayloadGuard,
    verifySellerSignupOtp
);

router.post(
    "/forgot-password/send-otp",
    authRouteRateLimiter,
    otpRouteRateLimiter,
    sellerOtpPayloadGuard,
    sendSellerForgotPasswordOtp
);
router.post(
    "/forgot-password/verify-otp",
    authRouteRateLimiter,
    otpRouteRateLimiter,
    sellerOtpPayloadGuard,
    verifySellerForgotPasswordOtpController
);
router.post("/reset-password", authRouteRateLimiter, resetSellerPassword);

router.post(
    "/signup",
    upload.any(),
    signupSeller
);
router.post("/login", loginSeller);
router.post("/refresh-token", refreshSellerToken);
router.post("/logout", verifyToken, logoutSeller);
router.get("/nearby", getNearbySellers);
router.get("/storefront/:sellerId", getStorefrontDetails);

// Profile routes
router.get(
    "/profile",
    verifyToken,
    allowRoles("seller"),
    getSellerProfile
);

router.put(
    "/profile",
    verifyToken,
    allowRoles("seller"),
    updateSellerProfile
);

// Step-up OTP verification before changing bank/UPI payout details
router.post(
    "/profile/bank-update/send-otp",
    verifyToken,
    allowRoles("seller"),
    otpRouteRateLimiter,
    sendBankUpdateOtp
);
router.post(
    "/profile/bank-update/verify-otp",
    verifyToken,
    allowRoles("seller"),
    otpRouteRateLimiter,
    verifyBankUpdateOtp
);

// GST report download — seller's own sales/documents-issued/commission/settlement CSVs
// (?reportType=seller_sales|documents_issued|commission|settlement, financialYear, taxPeriod, startDate, endDate)
router.get(
    "/gst/download",
    verifyToken,
    allowRoles("seller"),
    downloadSellerGstReportController
);

// The seller's OWN issued documents only (tax invoices, credit notes, debit notes), each with
// both numbers. sellerId always comes from the token - never from the request.
router.get(
    "/invoices",
    verifyToken,
    allowRoles("seller"),
    listMyInvoicesController
);
router.get(
    "/invoices/:invoiceId",
    verifyToken,
    allowRoles("seller"),
    getMyInvoiceController
);

router.get("/zones", getActiveZonesForSeller);

router.get(
    "/store-status",
    verifyToken,
    allowRoles("seller"),
    getStoreStatus
);

router.patch(
    "/store-status",
    verifyToken,
    allowRoles("seller"),
    updateStoreStatus
);

router.get(
    "/shop-schedule",
    verifyToken,
    allowRoles("seller"),
    getShopSchedule
);

router.put(
    "/shop-schedule",
    verifyToken,
    allowRoles("seller"),
    updateShopSchedule
);

// QR Bags
// Note: Some routes inside qrBagsSellerRoutes don't have a /bags prefix explicitly if mounted at root,
// wait, the frontend calls /seller/bag-requests and /seller/bags
// So I should mount it at "/"
router.use("/", qrBagsSellerRoutes);

// Baskets
router.use("/baskets", basketsSellerRoutes);

// Analytics & Financials
router.get("/stats", verifyToken, allowRoles("seller"), getSellerStats);
router.get("/earnings", verifyToken, allowRoles("seller"), getSellerEarnings);
router.get("/wallet/summary", verifyToken, allowRoles("seller"), getSellerWalletSummaryController);

export default router;
