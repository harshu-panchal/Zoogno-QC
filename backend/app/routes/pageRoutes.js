import express from "express";
import {
  getAdminPages,
  getAdminPageById,
  createPage,
  updatePage,
  deletePage,
  getPublishedPageBySlug
} from "../controllers/pageController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public routes
router.get("/public/:slug", getPublishedPageBySlug);

// Admin routes
router.get("/admin", verifyToken, allowRoles("admin"), getAdminPages);
router.get("/admin/:id", verifyToken, allowRoles("admin"), getAdminPageById);
router.post("/admin", verifyToken, allowRoles("admin"), createPage);
router.put("/admin/:id", verifyToken, allowRoles("admin"), updatePage);
router.delete("/admin/:id", verifyToken, allowRoles("admin"), deletePage);

export default router;
