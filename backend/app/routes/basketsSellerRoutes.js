import express from "express";
import {
  createBasketRequest,
  getBasketRequests,
  getPendingBasketRequestCount,
  getBasketInventory,
  validateBasket,
  attachBasket,
  detachBasket,
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

// Assignments
router.get("/:basketId/validate", validateBasket);
router.post("/attach", attachBasket);
router.post("/:basketId/detach", detachBasket);

export default router;
