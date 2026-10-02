import express from "express";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";
import {
  adminInvestigation,
  adminBeneficiaryOrders,
  adminApplyPenalty,
  adminListPenalties,
  adminGetPenalty,
  adminRevokePenalty,
  myPenalties,
} from "../controller/penaltyController.js";

const router = express.Router();

// Seller / delivery partner — read-only view of their own penalties.
router.get("/me", verifyToken, allowRoles("seller", "delivery"), myPenalties);

// Admin — investigate an order, then (only if responsible) apply / revoke a penalty.
router.get("/admin/investigation/:orderId", verifyToken, allowRoles("admin"), adminInvestigation);
router.get("/admin/beneficiary-orders", verifyToken, allowRoles("admin"), adminBeneficiaryOrders);
router.get("/admin", verifyToken, allowRoles("admin"), adminListPenalties);
router.post("/admin", verifyToken, allowRoles("admin"), adminApplyPenalty);
router.get("/admin/:id", verifyToken, allowRoles("admin"), adminGetPenalty);
router.post("/admin/:id/revoke", verifyToken, allowRoles("admin"), adminRevokePenalty);

export default router;
