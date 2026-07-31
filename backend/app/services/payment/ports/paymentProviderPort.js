/**
 * PaymentProviderPort
 *
 * Abstract contract that every payment provider adapter (Cashfree, Stripe,
 * etc.) must implement. Domain code in paymentService.js only ever
 * sees a provider through this interface — it never imports a vendor SDK
 * directly.
 *
 * Implementations live under `../providers/<name>.adapter.js` and are wired
 * in `../providerRegistry.js`. The active provider is selected at runtime
 * via `process.env.PAYMENT_PROVIDER` (default: "cashfree").
 *
 * Methods must satisfy these contracts:
 *
 *  initiatePayment({ merchantOrderId, amountPaise, redirectUrl, customerInfo? })
 *    → { redirectUrl: string, paymentSessionId: string, gatewayResponse?: any }
 *
 *  getPaymentStatus({ merchantOrderId })
 *    → { state: string, transactionId?: string, responseCode?: string,
 *        gatewayResponse?: any }
 *
 *  validateWebhook({ rawBody, authorization })
 *    → boolean    (true ⇔ signature OK, false ⇔ reject the webhook)
 *
 *  decodeWebhookPayload({ rawBody })
 *    → { merchantOrderId, state, transactionId?, responseCode?, raw }
 *
 *  mapStatusToInternal(gatewayState)
 *    → one of the PAYMENT_STATUS constants (CAPTURED | FAILED | PENDING)
 *
 *  providerName
 *    → string (e.g. "phonepe"). Used for logging and DB labelling.
 */

export class PaymentProviderPort {
  get providerName() {
    throw new Error("providerName must be implemented");
  }

  async initiatePayment(_args) {
    throw new Error("initiatePayment must be implemented");
  }

  async getPaymentStatus(_args) {
    throw new Error("getPaymentStatus must be implemented");
  }

  async validateWebhook(_args) {
    throw new Error("validateWebhook must be implemented");
  }

  async decodeWebhookPayload(_args) {
    throw new Error("decodeWebhookPayload must be implemented");
  }

  async mapStatusToInternal(_gatewayState) {
    throw new Error("mapStatusToInternal must be implemented");
  }

  /**
   * initiateRefund - Issue a refund for a captured payment.
   * @param {{ merchantOrderId, refundId, amountPaise, reason? }}
   * @returns {{ refundId, status, gatewayResponse }}
   */
  async initiateRefund(_args) {
    throw new Error("initiateRefund must be implemented");
  }
}

export default PaymentProviderPort;
