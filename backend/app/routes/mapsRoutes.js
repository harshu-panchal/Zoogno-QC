import express from "express";
import {
  geocodeAddressController,
  reverseGeocodeController,
} from "../controller/mapsController.js";
import { verifyToken, optionalVerifyToken } from "../middleware/authMiddleware.js";
import { mapsRateLimit } from "../middleware/mapsRateLimit.js";

const router = express.Router();

// Forward geocode: address string -> lat/lng (server-side key).
// Auth required to avoid public abuse of the server API key.
router.get("/geocode", verifyToken, mapsRateLimit, geocodeAddressController);
// Reverse geocode runs on first page load for every visitor (logged in or not)
// to resolve their delivery location, so it can't require login. mapsRateLimit
// already caps anonymous callers per-IP to protect the Mapbox billing quota.
router.get("/reverse-geocode", optionalVerifyToken, mapsRateLimit, reverseGeocodeController);

export default router;
