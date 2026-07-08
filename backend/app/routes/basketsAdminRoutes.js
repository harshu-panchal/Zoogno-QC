import express from "express";
import {
  createBaskets,
  getInventory,
  getStats,
  getBasketDetails,
  assignToSeller,
  getSellersWithBasketCount,
  disableBasket,
  getBasketRequests,
  getPendingRequestsCount,
  approveRequest,
  rejectRequest,
  dispatchBasketRequest,
  markBasketRequestDelivered,
} from "../controller/admin/baskets.admin.controller.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(verifyToken, allowRoles("admin"));

// Requests
router.get("/requests", getBasketRequests);
router.get("/requests/pending-count", getPendingRequestsCount);
router.put("/requests/:id/approve", approveRequest);
router.put("/requests/:id/reject", rejectRequest);
router.put("/requests/:id/dispatch", dispatchBasketRequest);
router.put("/requests/:id/deliver", markBasketRequestDelivered);

// Inventory & Stats
router.get("/", getInventory);
router.get("/stats", getStats);

// Creation
router.post("/create", createBaskets);

// Assignment
router.post("/assign", assignToSeller);
router.get("/sellers", getSellersWithBasketCount);

// Parameterized routes (MUST be below specific paths)
router.get("/:basketId", getBasketDetails);
router.put("/:basketId/disable", disableBasket);

export default router;
