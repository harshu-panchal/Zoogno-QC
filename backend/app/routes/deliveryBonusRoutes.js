import express from "express";
import {
    getDeliveryPartnersWithBankDetails,
    grantBonus,
    getBonusHistory,
    getMyBonuses
} from "../controllers/deliveryBonusController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

// Admin routes
router.get("/partners", verifyToken, allowRoles("admin", "superadmin"), getDeliveryPartnersWithBankDetails);
router.post("/grant", verifyToken, allowRoles("admin", "superadmin"), grantBonus);
router.get("/history", verifyToken, allowRoles("admin", "superadmin"), getBonusHistory);

// Delivery routes
router.get("/my-bonuses", verifyToken, allowRoles("delivery"), getMyBonuses);

export default router;
