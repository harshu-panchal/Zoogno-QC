import express from "express";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";
import { uploadEvidence, fetchEvidence } from "../controller/penaltyController.js";

const router = express.Router();

// Product-condition photos: seller (before packing) / delivery partner (at pickup).
router.post("/:orderId", verifyToken, allowRoles("seller", "delivery"), uploadEvidence);
router.get("/:orderId", verifyToken, allowRoles("seller", "delivery", "admin"), fetchEvidence);

export default router;
