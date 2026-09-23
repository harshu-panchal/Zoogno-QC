/**
 * CashfreePayoutAdapter
 *
 * Talks to Cashfree's Payouts API (v2) to disburse settlement payouts to
 * sellers/delivery partners. Completely separate product/credentials from
 * the Payment Gateway adapter (cashfree.adapter.js) used for customer
 * checkout — never share env vars, headers, or webhook routes between them.
 *
 * Environment Variables Required:
 *   CASHFREE_PAYOUT_CLIENT_ID       — Payouts App/Client ID
 *   CASHFREE_PAYOUT_CLIENT_SECRET   — Payouts Client Secret (NEVER expose on frontend)
 *   CASHFREE_PAYOUT_API_VERSION     — e.g. "2024-01-01"
 *   CASHFREE_PAYOUT_BASE_URL        — Sandbox: https://sandbox.cashfree.com/payout
 *                                      Production: https://api.cashfree.com/payout
 *   CASHFREE_PAYOUT_WEBHOOK_SECRET  — Webhook secret from the Cashfree Payouts dashboard
 *
 * NOTE: Cashfree's public Payouts v2 docs are inconsistently detailed across
 * pages at the time this was written. Endpoint paths/field names below are
 * centralized here deliberately so a schema mismatch discovered during
 * sandbox testing is a one-line fix. Verify against the live sandbox before
 * relying on this in production.
 */

import crypto from "crypto";
import axios from "axios";
import logger from "../../../services/logger.js";

function payoutErrorMessage(error) {
  const data = error?.response?.data;
  if (!data) return error?.message || "Cashfree payout request failed";
  if (typeof data === "string") return data;
  if (data.message && data.code) return `${data.message} (${data.code})`;
  return data.message || data.error || JSON.stringify(data);
}

class CashfreePayoutAdapter {
  _headers() {
    return {
      "x-api-version": process.env.CASHFREE_PAYOUT_API_VERSION || "2024-01-01",
      "x-client-id": process.env.CASHFREE_PAYOUT_CLIENT_ID,
      "x-client-secret": process.env.CASHFREE_PAYOUT_CLIENT_SECRET,
      "Content-Type": "application/json",
    };
  }

  _baseUrl() {
    return process.env.CASHFREE_PAYOUT_BASE_URL || "https://sandbox.cashfree.com/payout";
  }

  /**
   * Creates a beneficiary if it doesn't already exist. Idempotent — a 409
   * "beneficiary already exists" for our own deterministic beneficiaryId is
   * treated as success, not an error.
   *
   * @param {Object} args
   * @param {string} args.beneficiaryId  - Our deterministic id, e.g. "SELLER-<id>" / "RIDER-<id>"
   * @param {string} args.name
   * @param {string} [args.bankAccountNumber]
   * @param {string} [args.ifsc]
   * @param {string} [args.vpa]          - UPI VPA, used when no bank account is supplied
   * @param {string} [args.email]
   * @param {string} [args.phone]
   * @param {string} [args.address]
   * @param {string} [args.city]
   * @param {string} [args.state]
   * @param {string} [args.pincode]
   */
  async createOrGetBeneficiary({
    beneficiaryId,
    name,
    bankAccountNumber,
    ifsc,
    vpa,
    email,
    phone,
    address,
    city,
    state,
    pincode,
  }) {
    const instrumentDetails = bankAccountNumber && ifsc
      ? { bank_account_number: bankAccountNumber, bank_ifsc: ifsc }
      : { vpa };

    const payload = {
      beneficiary_id: beneficiaryId,
      beneficiary_name: name,
      beneficiary_instrument_details: instrumentDetails,
      beneficiary_contact_details: {
        beneficiary_email: email || undefined,
        beneficiary_phone: phone || undefined,
        beneficiary_country_code: "+91",
        beneficiary_address: address || undefined,
        beneficiary_city: city || undefined,
        beneficiary_state: state || undefined,
        beneficiary_postal_code: pincode || undefined,
      },
    };

    try {
      const response = await axios.post(`${this._baseUrl()}/beneficiary`, payload, {
        headers: this._headers(),
      });
      return response.data;
    } catch (error) {
      const code = error?.response?.data?.code;
      const status = error?.response?.status;
      const isAlreadyExists = status === 409 && (
        code === "beneficiary_id_already_exists" ||
        code === "beneficiary_already_exists" ||
        code === "conflict_with_existing_beneficiary"
      );
      if (isAlreadyExists) {
        // Already registered under our deterministic id — safe to proceed.
        return this.getBeneficiary(beneficiaryId);
      }
      throw new Error(payoutErrorMessage(error));
    }
  }

  async getBeneficiary(beneficiaryId) {
    try {
      const response = await axios.get(`${this._baseUrl()}/beneficiary/${beneficiaryId}`, {
        headers: this._headers(),
      });
      return response.data;
    } catch (error) {
      throw new Error(payoutErrorMessage(error));
    }
  }

  /**
   * Initiates a transfer. Async by default — the returned status is an
   * initial state (PENDING/PROCESSING/etc.), never a final SUCCESS/FAILED
   * on the synchronous response. Final status arrives via webhook or a
   * follow-up getTransferStatus() call.
   *
   * @param {Object} args
   * @param {string} args.transferId     - Our SettlementPayout.payoutId (idempotency key)
   * @param {number} args.amount         - Rupees
   * @param {string} args.beneficiaryId
   * @param {string} [args.remarks]
   */
  async createTransfer({ transferId, amount, beneficiaryId, remarks }) {
    const payload = {
      transfer_id: transferId,
      transfer_amount: amount,
      transfer_currency: "INR",
      beneficiary_details: { beneficiary_id: beneficiaryId },
      transfer_remarks: remarks || undefined,
    };

    try {
      const response = await axios.post(`${this._baseUrl()}/transfers`, payload, {
        headers: this._headers(),
      });
      return response.data;
    } catch (error) {
      throw new Error(payoutErrorMessage(error));
    }
  }

  async getTransferStatus(transferId) {
    try {
      const response = await axios.get(`${this._baseUrl()}/transfers`, {
        headers: this._headers(),
        params: { transfer_id: transferId },
      });
      return response.data;
    } catch (error) {
      throw new Error(payoutErrorMessage(error));
    }
  }

  /**
   * Maps a Cashfree transfer status string onto our internal
   * SettlementPayout.status values.
   */
  mapCashfreeStatus(cashfreeStatus) {
    const upper = String(cashfreeStatus || "").toUpperCase();
    if (upper === "SUCCESS") return "PAID";
    if (["FAILED", "REJECTED", "REVERSED", "MANUALLY_REJECTED"].includes(upper)) return "FAILED";
    return "PROCESSING";
  }

  /**
   * Verifies the Cashfree Payouts webhook signature.
   * Mirrors the same HMAC-SHA256(timestamp + rawBody, secret) → base64
   * pattern already proven working for the Payment Gateway webhook in
   * cashfree.adapter.js#validateWebhook, applied with the Payouts webhook
   * secret instead.
   *
   * Expected header: `x-webhook-signature`, timestamp in `x-webhook-timestamp`.
   */
  verifyWebhookSignature({ rawBody, signature, headers = {} }) {
    try {
      const secret = process.env.CASHFREE_PAYOUT_WEBHOOK_SECRET;
      if (!secret || secret === "cf_payout_webhook_secret_here") {
        logger.warn("cashfree_payout_webhook_secret_not_set_accepting_for_sandbox");
        return true;
      }

      const timestamp = headers["x-webhook-timestamp"] || "";
      const body = Buffer.isBuffer(rawBody) ? rawBody.toString("utf-8") : rawBody;

      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(timestamp + body)
        .digest("base64");

      const expected = Buffer.from(expectedSignature);
      const received = Buffer.from(signature || "");

      if (expected.length !== received.length) {
        logger.warn("cashfree_payout_webhook_signature_length_mismatch");
        return false;
      }

      const isValid = crypto.timingSafeEqual(expected, received);
      if (!isValid) {
        logger.warn("cashfree_payout_webhook_invalid_signature");
      }
      return isValid;
    } catch (error) {
      logger.error("cashfree_payout_webhook_validation_error", { error: error.message });
      return false;
    }
  }

  decodeWebhookPayload(rawBody) {
    const body = Buffer.isBuffer(rawBody) ? rawBody.toString("utf-8") : rawBody;
    const parsed = typeof body === "string" ? JSON.parse(body) : body;
    const data = parsed.data || parsed;

    return {
      eventType: parsed.type || parsed.event || "",
      transferId: data.transfer_id || data.transferId || null,
      cfTransferId: data.cf_transfer_id || data.referenceId || null,
      status: data.status || data.transfer_status || null,
      statusCode: data.status_code || null,
      statusDescription: data.status_description || data.reason || null,
      raw: parsed,
    };
  }
}

export const cashfreePayoutAdapter = new CashfreePayoutAdapter();
