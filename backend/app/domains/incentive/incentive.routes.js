import express from "express";
import { verifyToken, allowRoles } from "../../middleware/authMiddleware.js";
import { validate } from "../../middleware/validate.js";
import { campaignBodySchema, campaignUpdateSchema, assignPartnersSchema } from "./incentive.validation.js";
import * as incentiveController from "./incentive.controller.js";

const router = express.Router();

router.get(
  "/eligible-partners",
  verifyToken,
  allowRoles("admin", "superadmin"),
  incentiveController.previewEligiblePartners,
);

router.get(
  "/",
  verifyToken,
  allowRoles("admin", "superadmin"),
  incentiveController.listCampaigns,
);

router.post(
  "/",
  verifyToken,
  allowRoles("admin", "superadmin"),
  validate(campaignBodySchema),
  incentiveController.createCampaign,
);

router.get(
  "/my-active",
  verifyToken,
  allowRoles("delivery"),
  incentiveController.getMyActiveOffers,
);

router.get(
  "/my-history",
  verifyToken,
  allowRoles("delivery"),
  incentiveController.getMyIncentiveHistory,
);

router.get(
  "/:id",
  verifyToken,
  allowRoles("admin", "superadmin"),
  incentiveController.getCampaign,
);

router.put(
  "/:id",
  verifyToken,
  allowRoles("admin", "superadmin"),
  validate(campaignUpdateSchema),
  incentiveController.updateCampaign,
);

router.patch(
  "/:id/status",
  verifyToken,
  allowRoles("admin", "superadmin"),
  incentiveController.setCampaignStatus,
);

router.get(
  "/:id/progress",
  verifyToken,
  allowRoles("admin", "superadmin"),
  incentiveController.listCampaignProgress,
);

router.post(
  "/:id/assign",
  verifyToken,
  allowRoles("admin", "superadmin"),
  validate(assignPartnersSchema),
  incentiveController.assignPartners,
);

export default router;
