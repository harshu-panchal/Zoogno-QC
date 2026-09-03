import express from "express";
import {
  geocodeAddressController,
  reverseGeocodeController,
} from "../controller/mapsController.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { mapsRateLimit } from "../middleware/mapsRateLimit.js";

const router = express.Router();

// Forward geocode: address string -> lat/lng (server-side key).
// Auth required to avoid public abuse of the server API key.
router.get("/geocode", verifyToken, mapsRateLimit, geocodeAddressController);
router.get("/reverse-geocode", verifyToken, mapsRateLimit, reverseGeocodeController);

export default router;
