import express from "express";
import {
  createBasketRequest,
  getBasketRequests,
  getPendingBasketRequestCount,
  getBasketInventory,
} from "../controller/seller/baskets.seller.controller.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(verifyToken, allowRoles("seller"));

// Requests
router.post("/requests", createBasketRequest);
router.get("/requests", getBasketRequests);
router.get("/requests/pending-count", getPendingBasketRequestCount);

// Inventory
router.get("/", getBasketInventory);

export default router;
