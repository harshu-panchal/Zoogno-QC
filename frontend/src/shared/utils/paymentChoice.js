/**
 * Pure rules for the checkout "how would you like to pay?" step (no React, so they can be
 * unit-tested in plain Node).
 *
 * There is NO default payment method. When the customer slides to place the order, the app asks
 * them to choose - except where there is genuinely nothing to choose.
 */

/**
 * What should happen when the customer slides to place the order?
 *
 *   { action: 'choose', options }  - open the popup so they pick Online / COD (/ Wallet)
 *   { action: 'place', method }    - nothing to choose, place the order with `method`
 *   { action: 'none' }             - no payment method is usable at all
 *
 * Nothing to choose means: nothing is left to pay (a free order, or one fully covered by wallet
 * credit), or exactly one method is usable (e.g. the admin switched COD or online off).
 *
 * @param {object}  args
 * @param {number}  args.amountDue          amount still to be paid after any wallet credit
 * @param {number}  args.walletAmountToUse  wallet credit being applied
 * @param {Array<{id: string, disabled?: boolean}>} args.methods  every method shown in the list
 */
export function resolvePaymentFlow({ amountDue, walletAmountToUse = 0, methods = [] }) {
  if (!(Number(amountDue) > 0)) {
    return { action: 'place', method: Number(walletAmountToUse) > 0 ? 'wallet' : 'cash' };
  }
  const usable = (methods || []).filter((m) => m && !m.disabled);
  if (usable.length === 0) return { action: 'none' };
  if (usable.length === 1) return { action: 'place', method: usable[0].id };
  return { action: 'choose', options: usable };
}

/**
 * The API's `paymentMode` for a UI method id. `fallback` is used when no method has been chosen
 * yet (the pricing preview does not depend on the mode, so it previews as ONLINE).
 */
export function toPaymentMode(method, fallback = 'ONLINE') {
  if (method === 'wallet') return 'WALLET';
  if (method === 'online') return 'ONLINE';
  if (method === 'cash') return 'COD';
  return fallback;
}

/**
 * Wallet credit applied to the order for the method chosen NOW. Computed from the choice itself
 * because React state set in the popup a moment earlier is not visible yet.
 *  - paying by Wallet covers the whole total
 *  - otherwise the optional "use wallet balance" toggle covers as much as the balance allows
 */
export function walletAmountForOrder({ method, grandTotal, useWallet = false, walletBalance = 0 }) {
  const total = Math.max(0, Number(grandTotal) || 0);
  if (method === 'wallet') return total;
  if (useWallet && Number(walletBalance) > 0) return Math.min(Number(walletBalance), total);
  return 0;
}
