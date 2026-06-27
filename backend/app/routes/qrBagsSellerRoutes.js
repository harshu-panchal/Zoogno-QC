import express from "express";
import {
  requestBags,
  getBagRequests,
  getPendingRequestsCount,
  getMyBags,
  validateBag,
  attachBag,
  detachBag,
  getLabelData,
  payForBagRequest,
  verifyBagPayment
} from "../controller/seller/qrBags.seller.controller.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(verifyToken, allowRoles("seller"));

// Bag Requests
router.post("/bag-requests", requestBags);
router.get("/bag-requests", getBagRequests);
router.get("/bag-requests/pending-count", getPendingRequestsCount);
router.post("/bag-requests/:id/pay", payForBagRequest);
router.get("/bag-requests/:id/verify", verifyBagPayment);

// Bags Management
router.get("/bags", getMyBags);
router.get("/bags/:bagId/validate", validateBag);
router.post("/bags/attach", attachBag);
router.post("/bags/:bagId/detach", detachBag);

// Labels
router.get("/bags/label/:orderId", getLabelData);

export default router;
