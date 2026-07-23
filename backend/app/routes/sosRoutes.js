import express from "express";
import { triggerSos, getSosAlerts, resolveSosAlert } from "../controllers/sosController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

// Delivery boy triggers SOS
router.post("/delivery/sos", verifyToken, allowRoles("delivery"), triggerSos);

// Admin routes
router.get("/admin/sos", verifyToken, allowRoles("admin"), getSosAlerts);
router.put("/admin/sos/:id/resolve", verifyToken, allowRoles("admin"), resolveSosAlert);

export default router;
