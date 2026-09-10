/**
 * CashfreeAdapter
 *
 * Implements PaymentProviderPort for the Cashfree Payments API (v2025-01-01).
 *
 * Cashfree docs: https://docs.cashfree.com/reference/pg-new-apis-endpoint
 *
 * Flow:
 *  1. Backend calls `initiatePayment` → Cashfree creates an order → returns `payment_session_id`
 *  2. Frontend loads Cashfree JS SDK and calls `cashfree.checkout({ paymentSessionId })`
 *  3. Customer completes payment (UPI / Card / Net Banking / Wallet)
 *  4. Cashfree sends a webhook to `/api/payments/webhook/callback`
 *  5. Backend calls `validateWebhook` to verify signature, then `decodeWebhookPayload`
 *  6. Backend updates order status accordingly
 *
 * Environment Variables Required:
 *   CASHFREE_APP_ID        — Your Cashfree App ID
 *   CASHFREE_SECRET_KEY    — Your Cashfree Secret Key (NEVER expose on frontend)
 *   CASHFREE_API_VERSION   — e.g. "2025-01-01"
 *   CASHFREE_BASE_URL      — Sandbox: https://sandbox.cashfree.com/pg
 *                            Production: https://api.cashfree.com/pg
 *   CASHFREE_WEBHOOK_SECRET — Webhook secret from Cashfree dashboard
 */

import crypto from "crypto";
import axios from "axios";
import { PaymentProviderPort } from "../ports/paymentProviderPort.js";
import { PAYMENT_STATUS } from "../../../constants/payment.js";
import logger from "../../../services/logger.js";

function cashfreeErrorMessage(error) {
  const data = error?.response?.data;
  if (!data) return error?.message || "Cashfree request failed";
  if (typeof data === "string") return data;
  if (data.message && data.code) return `${data.message} (${data.code})`;
  return data.message || data.error || JSON.stringify(data);
}

function cashfreePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return "9999999999";
}

function cashfreeNotifyUrl() {
  return `${process.env.API_URL || "http://localhost:5000"}/api/payments/webhook/callback`.replace(
    /^http:/i,
    "https:",
  );
}

export class CashfreeAdapter extends PaymentProviderPort {
  // ─── Provider identity ───────────────────────────────────────────────
  get providerName() {
    return "CASHFREE";
  }

  // ─── Build reusable Axios headers for Cashfree REST API ──────────────
  _headers() {
    return {
      "x-api-version": process.env.CASHFREE_API_VERSION || "2025-01-01",
      "x-client-id": process.env.CASHFREE_APP_ID,
      "x-client-secret": process.env.CASHFREE_SECRET_KEY,
      "Content-Type": "application/json",
    };
  }

  // ─── Base URL helper ─────────────────────────────────────────────────
  _baseUrl() {
    return (
      process.env.CASHFREE_BASE_URL || "https://sandbox.cashfree.com/pg"
    );
  }

  /**
   * initiatePayment
   *
   * Creates a Cashfree order and returns the payment_session_id used by the
   * frontend Cashfree JS SDK to open the payment UI.
   *
   * @param {Object} args
   * @param {string} args.merchantOrderId  - Our internal order ID (used as Cashfree `order_id`)
   * @param {number} args.amountPaise      - Amount in paise (e.g. 50000 = ₹500)
   * @param {string} args.redirectUrl      - URL Cashfree redirects to after payment
   * @param {Object} [args.customerInfo]   - Optional customer name/email/phone
   * @returns {{ redirectUrl: string, paymentSessionId: string }}
   */
  async initiatePayment({ merchantOrderId, amountPaise, redirectUrl, customerInfo = {} }) {
    const amountRupees = amountPaise / 100;

    const orderPayload = {
      order_id: merchantOrderId,
      order_amount: amountRupees,
      order_currency: "INR",
      // Cashfree requires customer_details
      customer_details: {
        customer_id: customerInfo.customerId || merchantOrderId,
        customer_name: customerInfo.name || "Customer",
        customer_email: customerInfo.email || "customer@zoogno.com",
        customer_phone: cashfreePhone(customerInfo.phone),
      },
      order_meta: {
        return_url: redirectUrl + (redirectUrl.includes('?') ? '&' : '?') + "merchantOrderId=" + merchantOrderId,
        notify_url: cashfreeNotifyUrl(),
      },
      order_note: "Zoogno order payment",
    };

    logger.info("cashfree_create_order_request", {
      merchantOrderId,
      amountRupees,
      redirectUrl,
    });

    try {
      const response = await axios.post(
        `${this._baseUrl()}/orders`,
        orderPayload,
        { headers: this._headers() }
      );

      const data = response.data;

      if (!data.payment_session_id) {
        throw new Error(
          `Cashfree did not return payment_session_id. Response: ${JSON.stringify(data)}`
        );
      }

      logger.info("cashfree_create_order_success", {
        merchantOrderId,
        cashfreeOrderId: data.cf_order_id,
        paymentSessionId: data.payment_session_id?.slice(0, 12) + "...",
      });

      return {
        redirectUrl: redirectUrl,
        paymentSessionId: data.payment_session_id,
        cfOrderId: data.cf_order_id,
        gatewayResponse: data,
      };
    } catch (error) {
      const errMsg =
        error?.response?.data?.message ||
        error?.message ||
        "Cashfree create order failed";
      logger.error("cashfree_create_order_error", {
        merchantOrderId,
        status: error?.response?.status,
        error: errMsg,
      });
      const err = new Error(errMsg);
      err.statusCode = error?.response?.status || 500;
      throw err;
    }
  }

  _extractUpiQrPayload(data = {}) {
    const nested = data.data && !Array.isArray(data.data) ? data.data : {};
    const candidates = [
      data.qrcode,
      nested.qrcode,
      nested.qrCode,
      nested.url,
      nested.payload,
      data.payload,
      data.url,
      nested.content,
    ];
    for (const value of candidates) {
      if (typeof value === "string" && value.trim()) return value.trim();
      if (value && typeof value === "object") {
        if (typeof value.url === "string" && value.url.trim()) return value.url.trim();
        if (typeof value.payload === "string" && value.payload.trim()) return value.payload.trim();
      }
    }
    return null;
  }

  /**
   * Cashfree Order Pay (S2S): POST /orders/sessions (latest) or /orders/pay (legacy).
   * GET /orders/{id}/payments only lists payments and returns [].
   */
  async initiateUpiQr({
    merchantOrderId,
    paymentSessionId,
    amountPaise,
    customerInfo = {},
    redirectUrl,
  }) {
    const body = {
      payment_session_id: paymentSessionId,
      payment_method: {
        upi: {
          channel: "qrcode",
        },
      },
    };

    try {
      let lastPayError = null;
      if (paymentSessionId) {
        const endpoints = ["/orders/pay", "/orders/sessions"];
        for (const path of endpoints) {
          try {
            const response = await axios.post(`${this._baseUrl()}${path}`, body, {
              headers: this._headers(),
            });
            const data = response.data || {};
            const qrPayload = this._extractUpiQrPayload(data);
            if (qrPayload) {
              logger.info("cashfree_upi_qr_created", {
                merchantOrderId,
                via: path,
                cfPaymentId: data.cf_payment_id,
              });
              return {
                qrPayload,
                gatewayPaymentId: data.cf_payment_id?.toString() || null,
                paymentSessionId,
                gatewayResponse: data,
              };
            }
            lastPayError = new Error(
              `Cashfree did not return a UPI QR payload from ${path}`,
            );
          } catch (payError) {
            lastPayError = payError;
            logger.warn("cashfree_order_pay_qr_failed", {
              merchantOrderId,
              path,
              status: payError?.response?.status,
              error: cashfreeErrorMessage(payError),
            });
          }
        }
      }

      const link = await this._createPaymentLinkQr({
        merchantOrderId,
        amountPaise,
        customerInfo,
        redirectUrl,
      });
      if (link?.qrPayload) {
        return link;
      }

      throw lastPayError || new Error("Cashfree UPI QR create failed");
    } catch (error) {
      const errMsg = cashfreeErrorMessage(error);
      logger.error("cashfree_upi_qr_error", {
        merchantOrderId,
        status: error?.response?.status,
        error: errMsg,
        body: error?.response?.data,
      });
      const err = new Error(errMsg);
      err.statusCode = error?.response?.status || 500;
      throw err;
    }
  }

  async _createPaymentLinkQr({ merchantOrderId, amountPaise, customerInfo = {}, redirectUrl }) {
    const amountRupees = Number(amountPaise || 0) / 100;
    const payload = {
      link_id: merchantOrderId,
      link_amount: amountRupees,
      link_currency: "INR",
      link_purpose: `COD collection ${merchantOrderId}`,
      customer_details: {
        customer_name: customerInfo.name || "Customer",
        customer_email: customerInfo.email || "customer@zoogno.com",
        customer_phone: cashfreePhone(customerInfo.phone),
      },
      link_notify: {
        send_sms: false,
        send_email: false,
      },
      link_meta: {
        notify_url: cashfreeNotifyUrl(),
        ...(redirectUrl && /^https:/i.test(redirectUrl)
          ? { return_url: redirectUrl }
          : {}),
      },
    };

    const response = await axios.post(`${this._baseUrl()}/links`, payload, {
      headers: this._headers(),
    });
    const data = response.data || {};
    let qrPayload =
      this._extractUpiQrPayload(data) ||
      (typeof data.link_qrcode === "string" && data.link_qrcode) ||
      (typeof data.link_url === "string" && data.link_url) ||
      null;

    if (
      qrPayload &&
      !qrPayload.startsWith("data:") &&
      !qrPayload.startsWith("http") &&
      !qrPayload.startsWith("upi:") &&
      qrPayload.length > 200
    ) {
      qrPayload = `data:image/png;base64,${qrPayload}`;
    }

    if (!qrPayload) {
      throw new Error(
        `Cashfree payment link did not return a QR. Response: ${JSON.stringify(data)}`,
      );
    }

    logger.info("cashfree_payment_link_qr_created", {
      merchantOrderId,
      linkUrl: data.link_url,
    });

    return {
      qrPayload,
      gatewayPaymentId: data.cf_link_id?.toString() || null,
      paymentSessionId: null,
      gatewayResponse: data,
    };
  }

  async getPaymentLinkStatus({ linkId }) {
    const response = await axios.get(`${this._baseUrl()}/links/${linkId}`, {
      headers: this._headers(),
    });
    const data = response.data || {};
    return {
      state: data.link_status || data.linkStatus,
      transactionId: data.cf_link_id?.toString() || null,
      gatewayResponse: data,
    };
  }

  /**
   * getPaymentStatus
   *
   * Fetches the current payment status for an order from Cashfree.
   *
   * @param {Object} args
   * @param {string} args.merchantOrderId - Our internal order ID
   * @returns {{ state, transactionId, responseCode, gatewayResponse }}
   */
  async getPaymentStatus({ merchantOrderId }) {
    try {
      const response = await axios.get(
        `${this._baseUrl()}/orders/${merchantOrderId}`,
        { headers: this._headers() }
      );

      const data = response.data;

      let transactionId = null;
      let responseCode = null;
      let paymentState = null;
      try {
        const paymentsRes = await axios.get(
          `${this._baseUrl()}/orders/${merchantOrderId}/payments`,
          { headers: this._headers() }
        );
        const payments = Array.isArray(paymentsRes.data) ? paymentsRes.data : [];
        const paid = payments.find((p) => {
          const st = String(p?.payment_status || "").toUpperCase();
          return st === "SUCCESS" || st === "PAID" || st === "COMPLETED";
        });
        const latest = paid || payments[0];
        if (latest) {
          transactionId = latest.cf_payment_id?.toString() || null;
          responseCode = latest.payment_message || null;
          paymentState = latest.payment_status || null;
        }
      } catch (_) {
        // Ignore errors from payments endpoint — order status is the fallback
      }

      const paidByPayment =
        paymentState &&
        ["SUCCESS", "PAID", "COMPLETED"].includes(String(paymentState).toUpperCase());

      return {
        state: paidByPayment ? "PAID" : data.order_status,
        transactionId,
        responseCode,
        gatewayResponse: data,
      };
    } catch (error) {
      const errMsg =
        error?.response?.data?.message ||
        error?.message ||
        "Cashfree get status failed";
      logger.error("cashfree_get_status_error", {
        merchantOrderId,
        error: errMsg,
      });
      const err = new Error(errMsg);
      err.statusCode = error?.response?.status || 500;
      throw err;
    }
  }

  /**
   * validateWebhook
   *
   * Verifies the Cashfree webhook signature.
   * Cashfree signs webhooks using HMAC-SHA256 of the raw request body
   * with the webhook secret.
   *
   * Expected header: `x-webhook-signature`
   * Cashfree webhook signature format: base64(HMAC-SHA256(timestamp + rawBody, secret))
   *
   * @param {Object} args
   * @param {Buffer|string} args.rawBody      - Raw request body (Buffer from express.raw)
   * @param {string}        args.authorization - Signature from `x-webhook-signature` header
   * @param {Object}        args.headers       - All request headers (for timestamp extraction)
   * @returns {boolean}
   */
  async validateWebhook({ rawBody, authorization, headers = {} }) {
    try {
      const secret = process.env.CASHFREE_WEBHOOK_SECRET;
      if (!secret || secret === "cf_webhook_secret_here") {
        // In sandbox without a real webhook secret, accept all for testing
        logger.warn("cashfree_webhook_secret_not_set_accepting_for_sandbox");
        return true;
      }

      const timestamp = headers["x-webhook-timestamp"] || "";
      const body = Buffer.isBuffer(rawBody) ? rawBody.toString("utf-8") : rawBody;

      // Cashfree signature: HMAC-SHA256(timestamp + body, secret) → base64
      const signatureData = timestamp + body;
      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(signatureData)
        .digest("base64");

      // Use timingSafeEqual to prevent timing attacks
      const expected = Buffer.from(expectedSignature);
      const received = Buffer.from(authorization || "");

      if (expected.length !== received.length) {
        logger.warn("cashfree_webhook_signature_length_mismatch");
        return false;
      }

      const isValid = crypto.timingSafeEqual(expected, received);
      if (!isValid) {
        logger.warn("cashfree_webhook_invalid_signature");
      }
      return isValid;
    } catch (err) {
      logger.error("cashfree_webhook_validation_error", { error: err.message });
      return false;
    }
  }

  /**
   * decodeWebhookPayload
   *
   * Parses the raw Cashfree webhook body into a standard format
   * consumed by paymentService.js.
   *
   * Cashfree webhook event types: PAYMENT_SUCCESS_WEBHOOK, PAYMENT_FAILED_WEBHOOK, etc.
   *
   * @param {Object} args
   * @param {Buffer|string} args.rawBody
   * @returns {{ eventId, merchantOrderId, state, transactionId, responseCode, raw }}
   */
  async decodeWebhookPayload({ rawBody }) {
    const body = Buffer.isBuffer(rawBody) ? rawBody.toString("utf-8") : rawBody;
    const parsed = typeof body === "string" ? JSON.parse(body) : body;

    // Cashfree webhook v2 structure
    const eventType = parsed.type || ""; // e.g. "PAYMENT_SUCCESS_WEBHOOK"
    const data = parsed.data || {};
    const orderData = data.order || {};
    const paymentData = data.payment || {};

    const linkId =
      data.link?.link_id ||
      data.payment_link?.link_id ||
      parsed.link_id ||
      null;
    const orderId = orderData.order_id || parsed.order_id || null;
    const merchantOrderId =
      (linkId && String(linkId).startsWith("COD-QR-") && linkId) ||
      (orderId && String(orderId).startsWith("COD-QR-") && orderId) ||
      linkId ||
      orderId ||
      null;

    const eventUpper = String(eventType).toUpperCase();
    let cashfreeOrderStatus =
      paymentData.payment_status ||
      data.link?.link_status ||
      orderData.order_status ||
      null;
    if (eventUpper.includes("PAYMENT_SUCCESS") || eventUpper.includes("SUCCESS_WEBHOOK")) {
      cashfreeOrderStatus = "PAID";
    } else if (eventUpper.includes("PAYMENT_FAILED") || eventUpper.includes("FAILED_WEBHOOK")) {
      cashfreeOrderStatus = "FAILED";
    }
    const transactionId = paymentData.cf_payment_id?.toString() || null;
    const responseCode = paymentData.payment_message || null;

    // Generate a stable event ID for idempotency
    const eventId =
      parsed.event_id ||
      parsed.eventId ||
      (merchantOrderId && transactionId
        ? `${merchantOrderId}-${transactionId}`
        : crypto.randomUUID());

    return {
      eventId,
      merchantOrderId,
      state: cashfreeOrderStatus,
      transactionId,
      responseCode,
      eventType,
      raw: parsed,
    };
  }

  /**
   * mapStatusToInternal
   *
   * Maps Cashfree order/payment statuses to the internal PAYMENT_STATUS constants.
   *
   * Cashfree statuses:
   *   PAID / SUCCESS → CAPTURED
   *   ACTIVE / PENDING → PENDING
   *   EXPIRED / CANCELLED / FAILED / PAYMENT_FAILED → FAILED
   *
   * @param {string} gatewayState
   * @returns {string} One of PAYMENT_STATUS constants
   */
  mapStatusToInternal(gatewayState) {
    if (!gatewayState) return PAYMENT_STATUS.PENDING;

    const state = String(gatewayState).toUpperCase();

    switch (state) {
      case "PAID":
      case "SUCCESS":
      case "PAYMENT_SUCCESS":
      case "COMPLETED":
      case "CAPTURED":
        return PAYMENT_STATUS.CAPTURED;

      case "ACTIVE":
      case "PENDING":
      case "PAYMENT_PENDING":
      case "PAYMENT_INITIATED":
      case "NOT_ATTEMPTED":
      case "FLAGGED":
        return PAYMENT_STATUS.PENDING;

      case "EXPIRED":
      case "CANCELLED":
      case "CANCELED":
      case "FAILED":
      case "PAYMENT_FAILED":
      case "USER_DROPPED":
      case "TERMINATION":
      case "TERMINATED":
        return PAYMENT_STATUS.FAILED;

      default:
        return PAYMENT_STATUS.PENDING;
    }
  }

  /**
   * initiateRefund
   *
   * Issues a refund for a captured payment via Cashfree.
   *
   * @param {Object} args
   * @param {string} args.merchantOrderId   - Our internal order ID
   * @param {string} args.refundId          - Unique refund ID (our generated ID)
   * @param {number} args.amountPaise       - Amount to refund in paise
   * @param {string} [args.reason]          - Refund reason for records
   * @returns {{ refundId, status, gatewayResponse }}
   */
  async initiateRefund({ merchantOrderId, refundId, amountPaise, reason = "Requested by admin" }) {
    const amountRupees = amountPaise / 100;

    try {
      const response = await axios.post(
        `${this._baseUrl()}/orders/${merchantOrderId}/refunds`,
        {
          refund_amount: amountRupees,
          refund_id: refundId,
          refund_note: reason,
        },
        { headers: this._headers() }
      );

      logger.info("cashfree_refund_initiated", {
        merchantOrderId,
        refundId,
        amountRupees,
      });

      return {
        refundId: response.data.refund_id || refundId,
        status: response.data.refund_status || "PENDING",
        gatewayResponse: response.data,
      };
    } catch (error) {
      const errMsg =
        error?.response?.data?.message ||
        error?.message ||
        "Cashfree refund failed";
      logger.error("cashfree_refund_error", {
        merchantOrderId,
        refundId,
        error: errMsg,
      });
      const err = new Error(errMsg);
      err.statusCode = error?.response?.status || 500;
      throw err;
    }
  }
}

export default CashfreeAdapter;
