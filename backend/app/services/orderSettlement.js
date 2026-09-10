import Transaction from "../models/transaction.js";
import {
  handleCodOrderFinance,
  settleDeliveredOrder,
} from "./finance/orderFinanceService.js";
import { invalidateDeliveryCaches } from "./delivery/deliveryEarningsService.js";
import { evaluateIncentivesForRider } from "../domains/incentive/incentive.evaluation.js";
import { applyDeliverySurgesForOrder } from "../domains/deliverySurge/deliverySurge.evaluation.js";

/**
 * Financial side effects when order becomes delivered (mirrors orderController).
 * Returns earningsBreakdown for the rider OTP success UI when a delivery boy is set.
 */
export async function applyDeliveredSettlement(order, orderIdString) {
  const settled = await settleDeliveredOrder(order._id);
  let earningsBreakdown = {
    baseEarning: Math.round(settled?.paymentBreakdown?.riderPayoutTotal || 0),
    surgeCharge: 0,
    surgeItems: [],
    totalEarning: Math.round(settled?.paymentBreakdown?.riderPayoutTotal || 0),
  };

  const method = (order.payment?.method || "").toLowerCase();
  const isCod = settled.paymentMode === "COD" || method === "cash" || method === "cod";
  const alreadyCollected =
    Boolean(settled.financeFlags?.codMarkedCollected) ||
    settled.codCollectionMethod === "UPI_QR" ||
    settled.codCollectionMethod === "CASH";
  if (isCod && settled.deliveryBoy && !alreadyCollected) {
    await handleCodOrderFinance(settled._id, {
      deliveryPartnerId: settled.deliveryBoy,
    });
  }

  // Legacy transaction compatibility for existing seller/rider dashboards.
  await Transaction.findOneAndUpdate(
    { reference: orderIdString, userModel: "Seller" },
    { status: "Settled" },
  );

  if (settled.deliveryBoy) {
    const deliveryEarning = Math.round(settled.paymentBreakdown?.riderPayoutTotal || 0);
    const deliveryMeta = {
      tipAmount: Math.round(settled.paymentBreakdown?.riderTipAmount || 0),
      payoutBase: Math.round(settled.paymentBreakdown?.riderPayoutBase || 0),
      payoutDistance: Math.round(settled.paymentBreakdown?.riderPayoutDistance || 0),
      payoutBonus: Math.round(settled.paymentBreakdown?.riderPayoutBonus || 0),
    };
    await Transaction.findOneAndUpdate(
      { reference: `DEL-ERN-${orderIdString}` },
      {
        $set: {
          amount: deliveryEarning,
          status: "Settled",
          meta: deliveryMeta,
        },
        $setOnInsert: {
          user: settled.deliveryBoy,
          userModel: "Delivery",
          order: settled._id,
          type: "Delivery Earning",
          reference: `DEL-ERN-${orderIdString}`,
        },
      },
      { upsert: true, new: true },
    );

    // Invalidate delivery partner cache so the frontend reflects new earnings immediately.
    // (invalidateDeliveryCaches wildcards the earnings key — getDeliveryEarnings' cache key
    // is compound (id + timeframe + dates + isHistory), so a plain per-id key here previously
    // matched nothing and silently invalidated no earnings cache entries at all.)
    await invalidateDeliveryCaches(settled.deliveryBoy).catch(() => {});
    await evaluateIncentivesForRider(settled.deliveryBoy, settled).catch(() => {});
    earningsBreakdown = await applyDeliverySurgesForOrder(settled);
  }

  return { settled, earningsBreakdown };
}
