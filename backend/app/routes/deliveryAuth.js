import express from "express";
import {
  signupDelivery,
  loginDelivery,
  verifyDeliveryOTP,
  getDeliveryProfile,
  updateDeliveryProfile,
} from "../controller/deliveryAuthController.js";
import {
  getDeliveryStats,
  getDeliveryEarnings,
  getDeliveryCodCashSummary,
  submitDeliveryCodCashToAdmin,
  getMyDeliveryOrders,
  requestWithdrawal,
  updateDeliveryLocation,
  generateDeliveryOtp,
  validateDeliveryOtp,
} from "../controller/deliveryController.js";
import { getRiderWalletSummaryController } from "../controller/adminFinanceController.js";
import {
  getAvailableSlots,
  bookSlot,
  getDriverSlots,
  updateUpcomingSlot,
  cancelUpcomingSlot
} from "../controller/delivery/driverSlotController.js";
import { getDriverStatus } from "../controller/delivery/driverStatusController.js";

import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";
import multer from "multer";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post(
  "/send-signup-otp",
  upload.any(),
  signupDelivery,
);
router.post("/send-login-otp", loginDelivery);
router.post("/verify-otp", verifyDeliveryOTP);

// Profile routes
router.get("/profile", verifyToken, getDeliveryProfile);
router.put("/profile", verifyToken, upload.any(), updateDeliveryProfile);
router.get("/stats", verifyToken, getDeliveryStats);
router.get("/earnings", verifyToken, getDeliveryEarnings);
router.get("/cod/summary", verifyToken, allowRoles("delivery"), getDeliveryCodCashSummary);
router.post("/cod/pay", verifyToken, allowRoles("delivery"), submitDeliveryCodCashToAdmin);
router.get("/wallet/summary", verifyToken, allowRoles("delivery"), getRiderWalletSummaryController);
router.get(
  "/order-history",
  verifyToken,
  allowRoles("delivery"),
  getMyDeliveryOrders,
);
router.post("/request-withdrawal", verifyToken, requestWithdrawal);
router.post("/location", verifyToken, updateDeliveryLocation);

// OTP generation for delivery completion
router.post(
  "/orders/:orderId/generate-otp",
  verifyToken,
  allowRoles("delivery", "admin"),
  generateDeliveryOtp
);

// OTP validation for delivery completion
router.post(
  "/orders/:orderId/validate-otp",
  verifyToken,
  allowRoles("delivery", "admin"),
  validateDeliveryOtp
);

// Slot Management Routes
router.get("/slots", verifyToken, allowRoles("delivery"), getAvailableSlots);
router.post("/driver-slots/book", verifyToken, allowRoles("delivery"), bookSlot);
router.get("/driver-slots", verifyToken, allowRoles("delivery"), getDriverSlots);
router.put("/driver-slots/:id", verifyToken, allowRoles("delivery"), updateUpcomingSlot);
router.delete("/driver-slots/:id", verifyToken, allowRoles("delivery"), cancelUpcomingSlot);
router.get("/driver-status", verifyToken, allowRoles("delivery"), getDriverStatus);

export default router;
