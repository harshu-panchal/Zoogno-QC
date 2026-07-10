import express from "express";
import {
    signupSeller,
    loginSeller,
    sendSellerSignupOtp,
    verifySellerSignupOtp,
    refreshSellerToken,
} from "../controller/sellerAuthController.js";
import { getSellerProfile, updateSellerProfile, requestWithdrawal, getNearbySellers, getStoreStatus, updateStoreStatus } from "../controller/sellerController.js";
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
    "/signup",
    upload.any(),
    signupSeller
);
router.post("/login", loginSeller);
router.post("/refresh-token", refreshSellerToken);
router.get("/nearby", getNearbySellers);

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
router.post("/request-withdrawal", verifyToken, allowRoles("seller"), requestWithdrawal);

export default router;
