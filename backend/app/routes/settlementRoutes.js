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
} from "../controller/admin/settlementController.js";

const router = express.Router();

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

export default router;
