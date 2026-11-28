import express from "express";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";
import {
  getPublicBestOffers,
  getMyBestOffer,
  upsertMyBestOffer,
  getAdminZoneListings,
  saveZoneOrder,
  setListingVisibility,
  updateAdminOfferConfig,
  updateOfferGuardrails,
} from "../controller/bestOffersController.js";

const router = express.Router();

// Customer
router.get("/", getPublicBestOffers);

// Seller
router.get("/seller/me", verifyToken, allowRoles("seller"), getMyBestOffer);
router.put("/seller/me", verifyToken, allowRoles("seller"), upsertMyBestOffer);

// Admin
router.get("/admin/zone/:zoneId", verifyToken, allowRoles("admin"), getAdminZoneListings);
router.put("/admin/zone/:zoneId/order", verifyToken, allowRoles("admin"), saveZoneOrder);
router.patch("/admin/listings/:sellerId/visibility", verifyToken, allowRoles("admin"), setListingVisibility);
router.patch("/admin/listings/:sellerId/config", verifyToken, allowRoles("admin"), updateAdminOfferConfig);
router.patch("/admin/guardrails", verifyToken, allowRoles("admin"), updateOfferGuardrails);

export default router;
