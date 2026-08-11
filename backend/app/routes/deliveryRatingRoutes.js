import express from "express";
import {
  submitDeliveryRating,
  getMyRating,
  getDeliveryBoyRatings,
  getOrderDeliveryRating,
} from "../controller/deliveryRatingController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

// Customer submits a delivery rating
router.post("/", verifyToken, allowRoles("customer"), submitDeliveryRating);

// Delivery boy views own rating summary
router.get("/my-rating", verifyToken, allowRoles("delivery"), getMyRating);

// Admin or delivery boy views individual reviews
router.get(
  "/delivery-boy/:id",
  verifyToken,
  allowRoles("admin", "superadmin", "delivery"),
  getDeliveryBoyRatings
);

// Customer checks if they already rated an order's delivery
router.get(
  "/order/:orderId",
  verifyToken,
  allowRoles("customer"),
  getOrderDeliveryRating
);

export default router;
