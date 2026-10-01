import express from "express";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";
import {
  riderGetState,
  riderReached,
  riderCall,
  riderMarkUnreachable,
  adminListCases,
  adminPendingCount,
  adminGetCase,
  adminCancel,
  adminRetry,
  adminListCharges,
  adminWaive,
  adminEarnings,
  customerMyCharges,
} from "../controller/customerUnreachableController.js";

const router = express.Router();

// Delivery partner — can report, never finalize.
router.get("/rider/:orderId", verifyToken, allowRoles("delivery"), riderGetState);
router.post("/rider/:orderId/reached", verifyToken, allowRoles("delivery"), riderReached);
router.post("/rider/:orderId/call", verifyToken, allowRoles("delivery"), riderCall);
router.post("/rider/:orderId/unreachable", verifyToken, allowRoles("delivery"), riderMarkUnreachable);

// Customer — read-only view of their pending charges.
router.get("/my-charges", verifyToken, allowRoles("customer", "user"), customerMyCharges);

// Admin — only admins can cancel, retry, charge or waive.
router.get("/admin/cases", verifyToken, allowRoles("admin"), adminListCases);
router.get("/admin/cases/pending-count", verifyToken, allowRoles("admin"), adminPendingCount);
router.get("/admin/cases/:caseId", verifyToken, allowRoles("admin"), adminGetCase);
router.post("/admin/cases/:caseId/cancel", verifyToken, allowRoles("admin"), adminCancel);
router.post("/admin/cases/:caseId/retry", verifyToken, allowRoles("admin"), adminRetry);
router.get("/admin/charges", verifyToken, allowRoles("admin"), adminListCharges);
router.post("/admin/charges/:chargeId/waive", verifyToken, allowRoles("admin"), adminWaive);
router.get("/admin/earnings", verifyToken, allowRoles("admin"), adminEarnings);

export default router;
