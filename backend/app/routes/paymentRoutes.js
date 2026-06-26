import express from "express";
import {
  createPaymentOrder,
  verifyPaymentStatus,
  handlePhonePeWebhook,
} from "../controller/paymentController.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { paymentRouteRateLimiter } from "../middleware/securityMiddlewares.js";

const paymentRoute = express.Router();

/**
 * Initiate a PhonePe payment order for a specific CheckoutGroupId or OrderId.
 * Auth: Required (Customer paying for their own order)
 */
paymentRoute.post(
  "/create-order",
  verifyToken,
  paymentRouteRateLimiter,
  createPaymentOrder,
);

/**
 * Verify payment status from client side (after redirect back from PhonePe).
 * Auth: Required
 */
paymentRoute.get(
  "/status/:id",
  verifyToken,
  paymentRouteRateLimiter,
  verifyPaymentStatus,
);

/**
 * PhonePe Server-to-Server Webhook.
 * Auth: None (Internal verification via x-verify / authorization header)
 */
paymentRoute.post(
  "/webhook/phonepe",
  express.raw({ type: "application/json" }), // SDK needs raw body for verification
  handlePhonePeWebhook,
);

/**
 * PhonePe Frontend Redirect Callback.
 * PhonePe redirects the user's browser via POST. This endpoint bounces it back
 * to the frontend via a GET redirect so SPA routers don't throw 404s.
 */
paymentRoute.all("/redirect/phonepe", (req, res) => {
  const target = req.query.target || "/";
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  res.redirect(303, `${frontendUrl}${target}`);
});

export default paymentRoute;
