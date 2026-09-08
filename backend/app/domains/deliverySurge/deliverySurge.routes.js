import express from "express";
import { verifyToken, allowRoles } from "../../middleware/authMiddleware.js";
import { validate } from "../../middleware/validate.js";
import {
  surgeRuleBodySchema,
  surgeRuleUpdateSchema,
  surgeStatusSchema,
} from "./deliverySurge.validation.js";
import * as deliverySurgeController from "./deliverySurge.controller.js";

const router = express.Router();

router.get(
  "/zones",
  verifyToken,
  allowRoles("admin", "superadmin"),
  deliverySurgeController.listZones,
);

router.get(
  "/",
  verifyToken,
  allowRoles("admin", "superadmin"),
  deliverySurgeController.listRules,
);

router.post(
  "/",
  verifyToken,
  allowRoles("admin", "superadmin"),
  validate(surgeRuleBodySchema),
  deliverySurgeController.createRule,
);

router.get(
  "/:id",
  verifyToken,
  allowRoles("admin", "superadmin"),
  deliverySurgeController.getRule,
);

router.put(
  "/:id",
  verifyToken,
  allowRoles("admin", "superadmin"),
  validate(surgeRuleUpdateSchema),
  deliverySurgeController.updateRule,
);

router.patch(
  "/:id/status",
  verifyToken,
  allowRoles("admin", "superadmin"),
  validate(surgeStatusSchema),
  deliverySurgeController.setStatus,
);

router.delete(
  "/:id",
  verifyToken,
  allowRoles("admin", "superadmin"),
  deliverySurgeController.deleteRule,
);

export default router;
