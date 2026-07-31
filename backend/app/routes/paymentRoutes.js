import express from "express";
import {
  createPaymentOrder,
  verifyPaymentStatus,
  handleWebhook,
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
 * Generic Server-to-Server Webhook.
 */
paymentRoute.post(
  "/webhook/callback",
  express.raw({ type: "application/json" }),
  handleWebhook,
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



export default paymentRoute;

