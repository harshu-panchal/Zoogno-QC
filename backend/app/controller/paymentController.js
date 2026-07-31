import handleResponse from "../utils/helper.js";
import {
  createPaymentOrderForOrderRef,
  verifyGatewayPaymentStatus,
  processGatewayWebhook,
} from "../services/paymentService.js";
import {
  createPaymentOrderSchema,
  verifyPaymentClientSchema,
  validateSchema,
} from "../validation/paymentValidation.js";
import logger from "../services/logger.js";
import { getActivePaymentProvider } from "../services/payment/providerRegistry.js";

function resolvePaymentErrorMessage(error) {
  const directMessage = String(error?.message || "").trim();
  if (directMessage) return directMessage;

  const responseStatusText = String(error?.response?.statusText || "").trim();
  if (responseStatusText) return `Payment gateway error: ${responseStatusText}`;

  const causeCode = String(error?.cause?.code || error?.code || "").trim();
  if (causeCode) return `Payment gateway request failed (${causeCode})`;

  return "Unable to initiate payment right now";
}

export const createPaymentOrder = async (req, res) => {
  try {
    const payload = validateSchema(createPaymentOrderSchema, req.body || {});
    const result = await createPaymentOrderForOrderRef({
      orderRef: payload.orderRef || payload.orderId,
      userId: req.user?.id,
      idempotencyKey: req.headers["idempotency-key"] || null,
      correlationId: req.correlationId || null,
    });

    return handleResponse(
      res,
      result.duplicate ? 200 : 201,
      result.duplicate ? "Re-using existing payment" : "Payment initiated",
      {
        payment: result.payment,
        redirectUrl: result.redirectUrl,
        // paymentSessionId is used by the Cashfree JS SDK on the frontend
        // to open the drop-in payment UI (UPI, Card, Net Banking, etc.)
        paymentSessionId: result.paymentSessionId || result.payment?.rawGatewayResponse?.paymentSessionId || null,
        merchantOrderId: result.payment.gatewayOrderId,
      },
    );
  } catch (error) {
    logger.error("createPaymentOrder failed", {
      scope: "PaymentController.createPaymentOrder",
      message: error?.message,
      statusCode: error?.statusCode || error?.status || 500,
      code: error?.code || error?.cause?.code || null,
      responseStatus: error?.response?.status || null,
      responseStatusText: error?.response?.statusText || null,
      orderRef: req.body?.orderRef || req.body?.orderId || null,
      userId: req.user?.id || null,
      correlationId: req.correlationId || null,
    });
    return handleResponse(
      res,
      error.statusCode || error.status || 500,
      resolvePaymentErrorMessage(error),
    );
  }
};

export const verifyPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const merchantOrderId = id || req.query.merchantOrderId;

    if (!merchantOrderId) {
      return handleResponse(res, 400, "merchantOrderId is required");
    }

    const verification = await verifyGatewayPaymentStatus({
      merchantOrderId,
      userId: req.user?.id,
      correlationId: req.correlationId || null,
    });

    return handleResponse(res, 200, "Payment status verified", {
      status: verification.status,
      payment: verification.payment,
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const handleWebhook = async (req, res) => {
  try {
    const rawBody = req.body;

    // Cashfree webhook signature is in 'x-webhook-signature'
    // Timestamp for signature verification is in 'x-webhook-timestamp'
    const signature = req.headers["x-webhook-signature"] || req.headers["authorization"] || req.headers["x-verify"];

    if (!signature) {
      // Cashfree sandbox may not always send signature — log and accept for dev
      const isDev = (process.env.NODE_ENV || "development") === "development";
      if (!isDev) {
        logger.warn("Webhook missing signature header", {
          scope: "PaymentController.handleWebhook",
          correlationId: req.correlationId || null,
          ip: req.ip,
        });
        return res.status(401).send("Unauthorized");
      }
      logger.warn("Webhook missing signature header — accepting in dev mode");
    }

    const result = await processGatewayWebhook({
      rawBody,
      authorization: signature || "",
      correlationId: req.correlationId || null,
      // Pass all headers so the adapter can extract x-webhook-timestamp for Cashfree
      headers: req.headers,
    });

    if (result.accepted) {
      return res.status(200).send("OK");
    }

    return res.status(400).send("Bad Request");
  } catch (error) {
    logger.error("Webhook processing failed", {
      scope: "PaymentController.handleWebhook",
      correlationId: req.correlationId || null,
      message: error?.message,
      error,
    });
    return res.status(500).send("Internal Server Error");
  }
};

export const getPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const merchantOrderId = id;

    const verification = await verifyGatewayPaymentStatus({
      merchantOrderId,
      userId: req.user?.id,
      correlationId: req.correlationId || null,
    });

    return handleResponse(res, 200, "Payment status retrieved", {
      status: verification.status,
      merchantOrderId: verification.payment.gatewayOrderId,
      amount: verification.payment.amount,
      currency: verification.payment.currency,
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

