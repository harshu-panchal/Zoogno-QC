import { cashfreePayoutAdapter } from "../services/payment/providers/cashfreePayout.adapter.js";
import { applyCashfreeWebhookUpdate } from "../services/finance/settlementService.js";
import logger from "../services/logger.js";

/**
 * POST /api/settlements/webhook/cashfree-payout
 * Public (signature-verified, not JWT-protected). Mounted with express.raw()
 * in index.js so the exact bytes are available for HMAC verification —
 * mirrors the Payment Gateway webhook's raw-body handling, on a completely
 * separate route/secret.
 */
export const handleCashfreePayoutWebhook = async (req, res) => {
  try {
    const rawBody = req.body; // Buffer, thanks to express.raw()
    const signature = req.headers["x-webhook-signature"];

    const isValid = cashfreePayoutAdapter.verifyWebhookSignature({
      rawBody,
      signature,
      headers: req.headers,
    });

    if (!isValid) {
      logger.warn("cashfree_payout_webhook_rejected_bad_signature");
      return res.status(401).json({ success: false, message: "Invalid signature" });
    }

    const event = cashfreePayoutAdapter.decodeWebhookPayload(rawBody);
    if (!event.transferId) {
      // Nothing we can reconcile without a transfer id — acknowledge so
      // Cashfree doesn't keep retrying an event we can never process.
      return res.status(200).json({ success: true });
    }

    await applyCashfreeWebhookUpdate({
      transferId: event.transferId,
      status: event.status,
      statusCode: event.statusCode,
      statusDescription: event.statusDescription,
      cfTransferId: event.cfTransferId,
      raw: event.raw,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error("cashfree_payout_webhook_error", { error: error.message });
    // Still 200 — a 5xx here just causes Cashfree to hammer retries for an
    // error that's on our side; the reconciliation job/manual refresh is the
    // fallback if a webhook is ever dropped.
    return res.status(200).json({ success: false, message: "Webhook processing failed" });
  }
};
