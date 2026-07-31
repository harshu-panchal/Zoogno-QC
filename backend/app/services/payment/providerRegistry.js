/**
 * Payment provider registry.
 *
 * Selects the active payment provider adapter at runtime based on the
 * `PAYMENT_PROVIDER` environment variable. Defaults to Cashfree.
 *
 * Adding a new provider:
 *   1. Implement a class extending `PaymentProviderPort` in
 *      `./providers/<name>.adapter.js`.
 *   2. Register it in the switch below.
 *   3. Deploy with `PAYMENT_PROVIDER=<name>` to opt-in.
 *
 * Rollback is a single env-var flip — no code change.
 */

import { CashfreeAdapter } from "./providers/cashfree.adapter.js";

let _provider = null;
let _providerName = null;
let _dynamicProviderName = null;

function resolveProviderName() {
  if (_dynamicProviderName) return _dynamicProviderName;
  return String(process.env.PAYMENT_PROVIDER || "cashfree").toLowerCase().trim();
}

function buildProvider(name) {
  switch (name) {
    case "cashfree":
      return new CashfreeAdapter();
    // future: case "stripe": return new StripeAdapter();
    default:
      throw new Error(`Unknown payment provider: ${name}`);
  }
}

/**
 * Returns the active provider singleton. Re-resolves when the env var
 * changes (used in tests).
 */
export function getActivePaymentProvider() {
  const desired = resolveProviderName();
  if (_provider && _providerName === desired) {
    return _provider;
  }
  _provider = buildProvider(desired);
  _providerName = desired;
  return _provider;
}

/**
 * Allows the settings controller / startup sequence to dynamically update
 * the active payment gateway based on DB config.
 */
export function setPaymentGatewaySetting(name) {
  if (!name) return;
  _dynamicProviderName = String(name).toLowerCase().trim();
  // Force a rebuild next time getActivePaymentProvider is called
  if (_providerName !== _dynamicProviderName) {
    _provider = null;
  }
}

/**
 * Test helper. Allows test code to swap the provider in for a fake.
 */
export function __setActivePaymentProviderForTests(provider, name = "test") {
  _provider = provider;
  _providerName = name;
}

/**
 * Test helper. Forces the next `getActivePaymentProvider()` call to rebuild.
 */
export function __resetPaymentProviderForTests() {
  _provider = null;
  _providerName = null;
}
