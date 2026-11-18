import express from "express";
import {
  getMyReviews,
  getPendingReviews,
  getProductReviews,
  getReviewEligibility,
  submitReview,
  updateMyReview,
  updateReviewStatus,
} from "../controller/reviewController.js";
import { allowRoles, verifyToken } from "../middleware/authMiddleware.js";
import validate from "../middleware/validate.js";
import { moderateReviewSchema, submitReviewSchema, updateReviewSchema } from "../validation/customerValidation.js";

const router = express.Router();

router.get("/product/:productId", getProductReviews);

router.get("/order/:orderId/eligibility", verifyToken, allowRoles("customer"), getReviewEligibility);
router.get("/mine", verifyToken, allowRoles("customer"), getMyReviews);
router.post("/", verifyToken, allowRoles("customer"), validate(submitReviewSchema), submitReview);
router.post("/submit", verifyToken, allowRoles("customer"), validate(submitReviewSchema), submitReview);
router.patch("/:id", verifyToken, allowRoles("customer"), validate(updateReviewSchema), updateMyReview);

router.get("/admin", verifyToken, allowRoles("admin"), getPendingReviews);
router.get("/admin/pending", verifyToken, allowRoles("admin"), getPendingReviews);
router.patch("/admin/status/:id", verifyToken, allowRoles("admin"), validate(moderateReviewSchema), updateReviewStatus);

export default router;
