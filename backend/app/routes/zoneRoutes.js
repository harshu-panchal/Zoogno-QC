import express from "express";
import {
  getZones,
  createZone,
  updateZone,
  deleteZone,
} from "../controller/admin/zoneController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

// Require admin token for all zone CRUD operations
router.use(verifyToken, allowRoles("admin"));

router.get("/", getZones);
router.post("/", createZone);
router.put("/:id", updateZone);
router.delete("/:id", deleteZone);

export default router;
