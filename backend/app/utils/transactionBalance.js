import Transaction from "../models/transaction.js";
import { roundCurrency, clampMoney } from "./money.js";

/**
 * Single source of truth for "available to withdraw" against the legacy
 * Transaction ledger (used by both sellers and delivery partners).
 *
 * This MUST be the only place this formula is written. It was previously
 * duplicated independently in withdrawal validation vs. earnings display
 * for both seller and delivery — the two copies drifted apart in practice
 * (sellers ended up shown a wallet-derived figure instead; delivery ended
 * up shown a time-windowed gross-earnings figure), letting the UI display
 * a balance that didn't match what a withdrawal request would actually be
 * validated against. Route every "what can this user withdraw right now"
 * question — validation and display alike — through this function.
 */
export async function computeWithdrawableBalance(userId, userModel) {
  const transactions = await Transaction.find({ user: userId, userModel })
    .select("status amount type")
    .lean();

  const settledBalance = roundCurrency(
    transactions
      .filter((t) => t.status === "Settled")
      .reduce((acc, t) => acc + (t.amount || 0), 0),
  );

  const pendingPayouts = roundCurrency(
    transactions
      .filter(
        (t) =>
          t.type === "Withdrawal" &&
          (t.status === "Pending" || t.status === "Processing"),
      )
      .reduce((acc, t) => acc + Math.abs(t.amount || 0), 0),
  );

  const availableBalance = clampMoney(settledBalance - pendingPayouts, 0);

  return { settledBalance, pendingPayouts, availableBalance };
}
