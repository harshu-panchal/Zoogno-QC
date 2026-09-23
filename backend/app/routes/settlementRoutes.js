import express from "express";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";
import { getMySettlementSummary, getMyPayoutHistory } from "../controller/settlementController.js";
import {
  getSellerBeneficiaries,
  getDeliveryBeneficiaries,
  getSellerBeneficiaryDetail,
  getDeliveryBeneficiaryDetail,
  getBeneficiaryRemaining,
  getDashboardSummary,
  getBeneficiaryHistory,
  createSettlementPayout,
  getAllPayouts,
  getSettlementPayoutById,
  cancelSettlementPayout,
  refreshSettlementPayoutStatus,
} from "../controller/admin/settlementController.js";
import { handleCashfreePayoutWebhook } from "../controller/settlementWebhookController.js";

const router = express.Router();

// Public — Cashfree Payouts webhook. Body is already a raw Buffer by the time
// it reaches here (see the path-scoped express.raw() registered in index.js,
// mounted before the global JSON body-parser); protected by HMAC signature
// verification instead of JWT. Must stay before any body-parsing middleware.
router.post("/webhook/cashfree-payout", handleCashfreePayoutWebhook);

// Seller / Delivery self-view (read-only — no withdrawal capability here or anywhere else).
router.get("/me", verifyToken, allowRoles("seller", "delivery"), getMySettlementSummary);
router.get("/me/history", verifyToken, allowRoles("seller", "delivery"), getMyPayoutHistory);

// Admin — beneficiary lists & dashboard.
router.get("/sellers", verifyToken, allowRoles("admin"), getSellerBeneficiaries);
router.get("/delivery-partners", verifyToken, allowRoles("admin"), getDeliveryBeneficiaries);
router.get("/summary", verifyToken, allowRoles("admin"), getDashboardSummary);

// Beneficiary detail: admin can view anyone; a seller/rider may only view their own record
// (ownership enforced inside the controller).
router.get("/seller/:sellerId", verifyToken, allowRoles("admin", "seller"), getSellerBeneficiaryDetail);
router.get("/delivery-partner/:partnerId", verifyToken, allowRoles("admin", "delivery"), getDeliveryBeneficiaryDetail);
router.get("/remaining/:userId", verifyToken, allowRoles("admin"), getBeneficiaryRemaining);
router.get("/history/:userId", verifyToken, allowRoles("admin", "seller", "delivery"), getBeneficiaryHistory);

// Admin — manual payout management (only admins may create/cancel payouts).
router.post("/payout", verifyToken, allowRoles("admin"), createSettlementPayout);
router.get("/payouts", verifyToken, allowRoles("admin"), getAllPayouts);
router.get("/payout/:payoutId", verifyToken, allowRoles("admin"), getSettlementPayoutById);
router.put("/payout/:payoutId/cancel", verifyToken, allowRoles("admin"), cancelSettlementPayout);
router.post("/payout/:payoutId/refresh-status", verifyToken, allowRoles("admin"), refreshSettlementPayoutStatus);

export default router;
