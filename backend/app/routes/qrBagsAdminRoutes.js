import express from "express";
import {
  generateBags,
  getInventory,
  getBagDetails,
  getBagTimeline,
  assignBagsToSeller,
  getSellerBags,
  getSellersWithBagCount,
  getBagRequests,
  getPendingRequestsCount,
  approveRequest,
  rejectRequest
} from "../controller/admin/qrBags.admin.controller.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(verifyToken, allowRoles("admin"));

// Inventory & Details
router.get("/", getInventory);
router.post("/generate", generateBags);
router.get("/requests", getBagRequests);
router.get("/requests/pending-count", getPendingRequestsCount);

// Specific Actions
router.post("/assign", assignBagsToSeller);
router.get("/sellers", getSellersWithBagCount);
router.get("/seller/:sellerId", getSellerBags);

// Parameterized Routes (MUST be below specific paths)
router.get("/:bagId", getBagDetails);
router.get("/:bagId/timeline", getBagTimeline);

// Requests Management
router.put("/requests/:id/approve", approveRequest);
router.put("/requests/:id/reject", rejectRequest);

export default router;
