import express from "express";
import {
  createPaymentOrder,
  verifyPaymentStatus,
  handlePhonePeWebhook,
  handleRazorpayWebhook,
} from "../controller/paymentController.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { paymentRouteRateLimiter } from "../middleware/securityMiddlewares.js";

const paymentRoute = express.Router();

/**
 * Initiate a payment order for a specific CheckoutGroupId or OrderId.
 * Auth: Required (Customer paying for their own order)
 */
paymentRoute.post(
  "/create-order",
  verifyToken,
  paymentRouteRateLimiter,
  createPaymentOrder,
);

/**
 * Verify payment status from client side (after redirect back from gateway).
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
  express.raw({ type: "application/json" }),
  handlePhonePeWebhook,
);

/**
 * Razorpay Server-to-Server Webhook.
 * Auth: None (Internal verification via x-razorpay-signature header)
 */
paymentRoute.post(
  "/webhook/razorpay",
  express.raw({ type: "application/json" }),
  handleRazorpayWebhook,
);

/**
 * Generic Gateway Frontend Redirect Callback.
 * The payment gateway redirects the user's browser here. This endpoint
 * bounces it back to the frontend via a GET redirect so SPA routers work.
 */
paymentRoute.all("/redirect/gateway", (req, res) => {
  const target = req.query.target || "/";
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  res.redirect(303, `${frontendUrl}${target}`);
});

/**
 * Legacy PhonePe redirect — kept for backward compatibility with
 * any in-flight payment links that already encoded this URL.
 */
paymentRoute.all("/redirect/phonepe", (req, res) => {
  const target = req.query.target || "/";
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  res.redirect(303, `${frontendUrl}${target}`);
});

export default paymentRoute;

