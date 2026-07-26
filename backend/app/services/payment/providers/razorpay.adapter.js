import Razorpay from "razorpay";
import crypto from "crypto";
import { PaymentProviderPort } from "../ports/paymentProviderPort.js";
import { PAYMENT_STATUS, PAYMENT_GATEWAY } from "../../../constants/payment.js";
import logger from "../../logger.js";

export class RazorpayAdapter extends PaymentProviderPort {
  constructor() {
    super();
    this.key_id = process.env.RAZORPAY_KEY_ID;
    this.key_secret = process.env.RAZORPAY_KEY_SECRET;

    if (this.key_id && this.key_secret) {
      this.razorpay = new Razorpay({
        key_id: this.key_id,
        key_secret: this.key_secret,
      });
    } else {
      logger.warn("Razorpay credentials (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) are missing. Razorpay operations will fail.");
    }
  }

  get providerName() {
    return PAYMENT_GATEWAY.RAZORPAY;
  }

  async initiatePayment({ merchantOrderId, amountPaise, redirectUrl }) {
    if (!this.razorpay) {
      throw new Error("Razorpay credentials not configured");
    }

    try {
      // Use Payment Links to closely match PhonePe's redirectUrl flow
      const paymentLink = await this.razorpay.paymentLink.create({
        amount: amountPaise,
        currency: "INR",
        accept_partial: false,
        reference_id: merchantOrderId,
        description: `Payment for Order ${merchantOrderId}`,
        callback_url: redirectUrl,
        callback_method: "get"
      });

      return {
        redirectUrl: paymentLink.short_url,
        gatewayResponse: paymentLink
      };
    } catch (error) {
      const details = error?.error?.description || error?.message || "Unknown Razorpay error";
      logger.error("Razorpay initiatePayment error", { error: details, merchantOrderId });
      throw new Error(`Razorpay Error: ${details}`);
    }
  }

  async getPaymentStatus({ merchantOrderId }) {
    if (!this.razorpay) {
      throw new Error("Razorpay credentials not configured");
    }

    try {
      // Query payment links by reference_id (which is our merchantOrderId)
      const paymentLinks = await this.razorpay.paymentLink.all({
        reference_id: merchantOrderId,
      });

      const items = paymentLinks.items || paymentLinks.payment_links;

      if (!paymentLinks || !items || items.length === 0) {
        logger.warn(`Razorpay payment link not found for reference_id: ${merchantOrderId}`);
        return {
          state: "PAYMENT_PENDING",
          gatewayResponse: { message: "Payment link not found" }
        };
      }

      // Take the most recent link created for this reference_id
      const link = items[0];

      // Map Razorpay payment link status to our state representation
      return {
        state: link.status,
        transactionId: link.order_id || link.id,
        gatewayResponse: link
      };
    } catch (error) {
      logger.error("Razorpay getPaymentStatus error", { error: error.message, merchantOrderId });
      throw new Error(`Razorpay Error: ${error.message}`);
    }
  }

  async validateWebhook({ rawBody, authorization }) {
    if (!this.key_secret) return false;

    try {
      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET || this.key_secret)
        .update(rawBody.toString())
        .digest("hex");

      return expectedSignature === authorization;
    } catch (e) {
      return false;
    }
  }

  async decodeWebhookPayload({ rawBody }) {
    const payload = JSON.parse(rawBody.toString());
    const event = payload.event;

    let merchantOrderId = null;
    let transactionId = null;

    if (payload.payload && payload.payload.payment && payload.payload.payment.entity) {
      transactionId = payload.payload.payment.entity.id;
      if (payload.payload.payment.entity.notes && payload.payload.payment.entity.notes.merchantOrderId) {
        merchantOrderId = payload.payload.payment.entity.notes.merchantOrderId;
      }
    }

    if (!merchantOrderId && payload.payload && payload.payload.payment_link && payload.payload.payment_link.entity) {
      merchantOrderId = payload.payload.payment_link.entity.reference_id;
    }

    return {
      eventId: payload.event,
      merchantOrderId,
      state: event,
      transactionId,
      raw: payload
    };
  }

  mapStatusToInternal(gatewayState) {
    switch (gatewayState) {
      case "COMPLETED":
      case "paid":
      case "payment.captured":
      case "payment_link.paid":
        return PAYMENT_STATUS.CAPTURED;

      case "payment.failed":
      case "FAILED":
      case "payment_link.expired":
      case "payment_link.cancelled":
        return PAYMENT_STATUS.FAILED;

      case "refund.created":
      case "refund.processed":
        return PAYMENT_STATUS.REFUNDED;

      default:
        return PAYMENT_STATUS.PENDING;
    }
  }
}
