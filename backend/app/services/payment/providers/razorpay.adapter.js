/**
 * RazorpayAdapter
 *
 * Implements PaymentProviderPort for Razorpay (Standard Checkout + Orders API
 * + UPI QR Codes API). Talks to the REST API directly via axios (no SDK).
 *
 * Flow:
 *  1. Backend `initiatePayment` → POST /orders → returns a `checkout` descriptor
 *     ({ keyId, orderId, amount, ... }) that the frontend feeds to Razorpay's
 *     checkout.js popup.
 *  2. Customer pays in the popup (UPI / Card / Netbanking / Wallet).
 *  3. Razorpay POSTs a webhook (`payment.captured`, `qr_code.credited`) to
 *     /api/payments/webhook/callback, signed with RAZORPAY_WEBHOOK_SECRET
 *     (header `x-razorpay-signature`, hex HMAC-SHA256 of the RAW body).
 *  4. Independently, the frontend lands on /payment-status which polls our
 *     `getPaymentStatus`, which asks Razorpay directly (source of truth).
 *
 * Our internal `merchantOrderId` is stored on the Razorpay order as
 * `notes.merchantOrderId` (and `receipt`, shortened to Razorpay's 40-char
 * limit) so webhooks and status checks can always map back to our records.
 *
 * Environment variables:
 *   RAZORPAY_KEY_ID          — rzp_test_xxx / rzp_live_xxx (public; also sent to the frontend)
 *   RAZORPAY_KEY_SECRET      — API secret (NEVER expose to the frontend)
 *   RAZORPAY_WEBHOOK_SECRET  — secret configured on the Razorpay webhook
 *   RAZORPAY_BASE_URL        — optional, default https://api.razorpay.com/v1
 *   RAZORPAY_CHECKOUT_NAME   — optional, merchant name shown in the popup
 */

import crypto from "crypto";
import axios from "axios";
import { PaymentProviderPort } from "../ports/paymentProviderPort.js";
import { PAYMENT_STATUS } from "../../../constants/payment.js";
import logger from "../../../services/logger.js";

const RECEIPT_MAX_LENGTH = 40; // Razorpay hard limit
const QR_DEFAULT_TTL_SECONDS = 15 * 60;
const QR_MIN_TTL_SECONDS = 150; // Razorpay requires close_by >= 2 minutes ahead

function razorpayErrorMessage(error) {
  const data = error?.response?.data;
  if (!data) return error?.message || "Razorpay request failed";
  if (typeof data === "string") return data;
  const err = data.error || data;
  if (err.description) return err.code ? `${err.description} (${err.code})` : err.description;
  return err.message || JSON.stringify(data);
}

function wrapError(error, fallback) {
  const err = new Error(razorpayErrorMessage(error) || fallback);
  err.statusCode = error?.response?.status || error?.statusCode || 500;
  return err;
}

/** Deterministic receipt ≤ 40 chars so lookups by receipt stay possible. */
export function toReceipt(merchantOrderId) {
  const id = String(merchantOrderId || "");
  if (id.length <= RECEIPT_MAX_LENGTH) return id;
  const hash = crypto.createHash("sha256").update(id).digest("hex").slice(0, 8);
  return `${id.slice(0, RECEIPT_MAX_LENGTH - 9)}-${hash}`;
}

function normalizeContact(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length < 10) return undefined;
  const local = digits.slice(-10);
  // Ignore obvious placeholder numbers so we never pre-fill fake data.
  if (/^(\d)\1{9}$/.test(local)) return undefined;
  return local;
}

function cleanEmail(raw) {
  const email = String(raw || "").trim();
  if (!email || /@zoogno\.com$/i.test(email) && /^customer@/i.test(email)) return undefined;
  return email;
}

const PAID_PAYMENT_STATES = new Set(["captured"]);

export class RazorpayAdapter extends PaymentProviderPort {
  get providerName() {
    return "RAZORPAY";
  }

  _keyId() {
    return process.env.RAZORPAY_KEY_ID;
  }

  _baseUrl() {
    return (process.env.RAZORPAY_BASE_URL || "https://api.razorpay.com/v1").replace(/\/$/, "");
  }

  _assertConfigured() {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      const err = new Error("Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing)");
      err.statusCode = 500;
      throw err;
    }
  }

  async _request(method, path, { data, params } = {}) {
    this._assertConfigured();
    const response = await axios.request({
      method,
      url: `${this._baseUrl()}${path}`,
      data,
      params,
      auth: {
        username: process.env.RAZORPAY_KEY_ID,
        password: process.env.RAZORPAY_KEY_SECRET,
      },
      headers: { "Content-Type": "application/json" },
      timeout: 20000,
    });
    return response.data;
  }

  /**
   * Creates a Razorpay order and returns the descriptor needed by checkout.js.
   */
  async initiatePayment({ merchantOrderId, amountPaise, redirectUrl, customerInfo = {} }) {
    const amount = Math.round(Number(amountPaise));
    const notes = { merchantOrderId };
    if (customerInfo.customerId) notes.customerId = String(customerInfo.customerId);

    logger.info("razorpay_create_order_request", { merchantOrderId, amount });

    try {
      const order = await this._request("post", "/orders", {
        data: {
          amount,
          currency: "INR",
          receipt: toReceipt(merchantOrderId),
          notes,
        },
      });

      if (!order?.id) {
        throw new Error(`Razorpay did not return an order id. Response: ${JSON.stringify(order)}`);
      }

      logger.info("razorpay_create_order_success", {
        merchantOrderId,
        razorpayOrderId: order.id,
      });

      const prefill = {};
      if (customerInfo.name && customerInfo.name !== "Customer") prefill.name = customerInfo.name;
      const email = cleanEmail(customerInfo.email);
      if (email) prefill.email = email;
      const contact = normalizeContact(customerInfo.phone);
      if (contact) prefill.contact = contact;

      return {
        redirectUrl,
        razorpayOrderId: order.id,
        checkout: {
          keyId: this._keyId(),
          orderId: order.id,
          amount: order.amount,
          currency: order.currency || "INR",
          name: process.env.RAZORPAY_CHECKOUT_NAME || "Zoogno",
          description: "Zoogno order payment",
          prefill,
          merchantOrderId,
        },
        gatewayResponse: order,
      };
    } catch (error) {
      const err = wrapError(error, "Razorpay create order failed");
      logger.error("razorpay_create_order_error", {
        merchantOrderId,
        status: err.statusCode,
        error: err.message,
      });
      throw err;
    }
  }

  /**
   * Finds the Razorpay order for our merchantOrderId (by explicit id, else by receipt).
   */
  async _resolveOrder({ merchantOrderId, providerOrderId }) {
    if (providerOrderId) {
      return this._request("get", `/orders/${encodeURIComponent(providerOrderId)}`);
    }
    const list = await this._request("get", "/orders", {
      params: { receipt: toReceipt(merchantOrderId), count: 10 },
    });
    const items = Array.isArray(list?.items) ? list.items : [];
    if (!items.length) return null;
    return (
      items.find((o) => o.status === "paid") ||
      items.sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0]
    );
  }

  /**
   * Fetches current status. Never reports an individual failed attempt as a
   * terminal failure — Razorpay lets the customer retry on the same order, so
   * only a captured/refunded payment (or an expired order) is conclusive.
   */
  async getPaymentStatus({ merchantOrderId, providerOrderId = null }) {
    try {
      const order = await this._resolveOrder({ merchantOrderId, providerOrderId });
      if (!order) {
        return { state: "created", transactionId: null, responseCode: null, gatewayResponse: null };
      }

      const paymentsRes = await this._request("get", `/orders/${encodeURIComponent(order.id)}/payments`);
      const payments = Array.isArray(paymentsRes?.items) ? paymentsRes.items : [];

      const settled = payments.find((p) => p.status === "refunded") ||
        payments.find((p) => PAID_PAYMENT_STATES.has(p.status));
      const latest = settled || [...payments].sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0];

      let state;
      if (settled?.status === "refunded") state = "refunded";
      else if (settled) state = "captured";
      else if (order.status === "paid") state = "captured";
      else if (latest?.status === "authorized") state = "authorized";
      else if (latest?.status === "failed") state = "attempt_failed";
      else state = order.status || "created";

      return {
        state,
        transactionId: (settled || latest)?.id || null,
        responseCode: latest?.error_description || latest?.error_code || null,
        amountPaise: settled?.amount ?? order.amount_paid ?? null,
        providerOrderId: order.id,
        gatewayResponse: {
          merchantOrderId,
          transactionId: (settled || latest)?.id || null,
          amount: order.amount,
          state,
          responseCode: latest?.error_code || null,
          paymentMode: (settled || latest)?.method || null,
          meta: { razorpayOrderId: order.id, orderStatus: order.status },
        },
      };
    } catch (error) {
      const err = wrapError(error, "Razorpay get status failed");
      logger.error("razorpay_get_status_error", { merchantOrderId, error: err.message });
      throw err;
    }
  }

  /**
   * Verifies `x-razorpay-signature` = hex(HMAC-SHA256(rawBody, webhookSecret)).
   * `rawBody` MUST be the untouched request bytes.
   */
  async validateWebhook({ rawBody, authorization }) {
    try {
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
      if (!secret) {
        const isDev = (process.env.NODE_ENV || "development") === "development";
        if (isDev) {
          logger.warn("razorpay_webhook_secret_not_set_accepting_in_dev");
          return true;
        }
        logger.error("razorpay_webhook_secret_not_set_rejecting");
        return false;
      }
      if (!authorization || !(Buffer.isBuffer(rawBody) || typeof rawBody === "string")) {
        return false;
      }

      const expected = Buffer.from(
        crypto.createHmac("sha256", secret).update(rawBody).digest("hex"),
      );
      const received = Buffer.from(String(authorization).trim());
      if (expected.length !== received.length) {
        logger.warn("razorpay_webhook_signature_length_mismatch");
        return false;
      }
      const ok = crypto.timingSafeEqual(expected, received);
      if (!ok) logger.warn("razorpay_webhook_invalid_signature");
      return ok;
    } catch (err) {
      logger.error("razorpay_webhook_validation_error", { error: err.message });
      return false;
    }
  }

  /**
   * Parses a Razorpay webhook into the provider-agnostic shape consumed by
   * paymentService. Events:
   *   payment.captured / order.paid → "captured"
   *   qr_code.credited              → "captured" (UPI QR payment received)
   *   payment.failed                → "attempt_failed" (NOT terminal: customer may retry)
   *   anything else                 → "ignored"
   */
  async decodeWebhookPayload({ rawBody, headers = {} }) {
    const body = Buffer.isBuffer(rawBody) ? rawBody.toString("utf-8") : rawBody;
    const parsed = typeof body === "string" ? JSON.parse(body) : body;

    const eventType = String(parsed.event || "");
    const payload = parsed.payload || {};
    const payment = payload.payment?.entity || {};
    const order = payload.order?.entity || {};
    const qr = payload.qr_code?.entity || {};

    const merchantOrderId =
      payment.notes?.merchantOrderId ||
      order.notes?.merchantOrderId ||
      qr.notes?.merchantOrderId ||
      null;
    const providerOrderId = payment.order_id || order.id || null;

    let state = "ignored";
    if (eventType === "payment.captured" || eventType === "order.paid" || eventType === "qr_code.credited") {
      state = "captured";
    } else if (eventType === "payment.failed") {
      state = "attempt_failed";
    }

    const eventId =
      headers["x-razorpay-event-id"] ||
      (payment.id ? `${eventType}-${payment.id}` : null) ||
      (qr.id ? `${eventType}-${qr.id}-${parsed.created_at || ""}` : null) ||
      crypto.randomUUID();

    return {
      eventId,
      merchantOrderId,
      providerOrderId,
      state,
      transactionId: payment.id || null,
      responseCode: payment.error_description || payment.error_code || null,
      amountPaise: payment.amount ?? null,
      eventType,
      raw: parsed,
    };
  }

  mapStatusToInternal(gatewayState) {
    if (!gatewayState) return PAYMENT_STATUS.PENDING;
    switch (String(gatewayState).toLowerCase()) {
      case "captured":
      case "paid":
        return PAYMENT_STATUS.CAPTURED;
      case "refunded":
        return PAYMENT_STATUS.REFUNDED;
      case "expired":
      case "cancelled":
      case "canceled":
      case "closed":
        return PAYMENT_STATUS.FAILED;
      // created / attempted / authorized / attempt_failed / ignored / active …
      default:
        return PAYMENT_STATUS.PENDING;
    }
  }

  /**
   * Refund a captured payment. Looks up the captured Razorpay payment for the
   * order unless `providerPaymentId` is supplied.
   */
  async initiateRefund({
    merchantOrderId,
    refundId,
    amountPaise,
    reason = "Requested by admin",
    providerPaymentId = null,
  }) {
    try {
      let paymentId = providerPaymentId;
      if (!paymentId) {
        const status = await this.getPaymentStatus({ merchantOrderId });
        if (status.state !== "captured" && status.state !== "refunded") {
          const err = new Error("No captured Razorpay payment found for this order");
          err.statusCode = 409;
          throw err;
        }
        paymentId = status.transactionId;
      }

      const refund = await this._request("post", `/payments/${encodeURIComponent(paymentId)}/refunds`, {
        data: {
          amount: Math.round(Number(amountPaise)),
          receipt: toReceipt(refundId),
          notes: { merchantOrderId, refundId, reason: String(reason).slice(0, 200) },
        },
      });

      logger.info("razorpay_refund_initiated", { merchantOrderId, refundId, razorpayRefundId: refund.id });

      return {
        refundId: refund.id || refundId,
        status: refund.status || "pending",
        gatewayResponse: refund,
      };
    } catch (error) {
      const err = error?.statusCode && !error.response ? error : wrapError(error, "Razorpay refund failed");
      logger.error("razorpay_refund_error", { merchantOrderId, refundId, error: err.message });
      throw err;
    }
  }

  /**
   * Doorstep UPI QR (Razorpay QR Codes API): single-use, fixed amount.
   * Requires the QR Codes product to be enabled on the Razorpay account.
   */
  async initiateUpiQr({ merchantOrderId, amountPaise, ttlSeconds = QR_DEFAULT_TTL_SECONDS }) {
    try {
      const closeBy = Math.floor(Date.now() / 1000) + Math.max(QR_MIN_TTL_SECONDS, ttlSeconds);
      const qr = await this._request("post", "/payments/qr_codes", {
        data: {
          type: "upi_qr",
          name: `COD ${merchantOrderId}`.slice(0, 60),
          usage: "single_use",
          fixed_amount: true,
          payment_amount: Math.round(Number(amountPaise)),
          description: `COD collection ${merchantOrderId}`,
          close_by: closeBy,
          notes: { merchantOrderId },
        },
      });

      const qrImageUrl = qr.image_url || null;
      if (!qr.id || !qrImageUrl) {
        throw new Error(`Razorpay did not return a QR image. Response: ${JSON.stringify(qr)}`);
      }

      logger.info("razorpay_upi_qr_created", { merchantOrderId, qrId: qr.id });

      return {
        qrPayload: qrImageUrl,
        qrImageUrl,
        gatewayQrId: qr.id,
        gatewayResponse: qr,
      };
    } catch (error) {
      const err = wrapError(error, "Razorpay UPI QR create failed");
      logger.error("razorpay_upi_qr_error", {
        merchantOrderId,
        status: err.statusCode,
        error: err.message,
        body: error?.response?.data,
      });
      throw err;
    }
  }

  /** Polls a UPI QR for payments (safety net for missed `qr_code.credited` webhooks). */
  async getUpiQrStatus({ qrId }) {
    const qr = await this._request("get", `/payments/qr_codes/${encodeURIComponent(qrId)}`);
    let payment = null;
    if (Number(qr.payments_count_received || 0) > 0) {
      const res = await this._request("get", `/payments/qr_codes/${encodeURIComponent(qrId)}/payments`);
      const items = Array.isArray(res?.items) ? res.items : [];
      payment = items.find((p) => p.status === "captured") || null;
    }
    return {
      state: payment ? "captured" : qr.status || "active",
      transactionId: payment?.id || null,
      amountPaise: payment?.amount ?? null,
      gatewayResponse: qr,
    };
  }
}

export default RazorpayAdapter;
