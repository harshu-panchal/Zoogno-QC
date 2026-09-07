import mongoose from "mongoose";
import IncentiveCampaign from "../../models/incentiveCampaign.js";
import IncentiveAssignment from "../../models/incentiveAssignment.js";
import IncentiveProgress from "../../models/incentiveProgress.js";
import IncentivePayout from "../../models/incentivePayout.js";
import Transaction from "../../models/transaction.js";
import Delivery from "../../models/delivery.js";
import Order from "../../models/order.js";
import Notification from "../../models/notification.js";
import { roundCurrency } from "../../utils/money.js";
import { invalidateDeliveryCaches } from "../../services/delivery/deliveryEarningsService.js";
import { emitToDelivery } from "../../services/orderSocketEmitter.js";
import logger from "../../services/logger.js";
import {
  clampPeriodToCampaign,
  isWithinCampaignWindow,
  resolvePeriod,
} from "./incentive.period.js";
import { isRiderEligibleForCampaign } from "./incentive.eligibility.js";

function toOid(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  const s = String(id);
  if (!mongoose.Types.ObjectId.isValid(s)) return null;
  return new mongoose.Types.ObjectId(s);
}

function buildTransactionRef(campaignId, deliveryId, periodKey) {
  const safeKey = String(periodKey || "campaign").replace(/[^A-Za-z0-9_-]/g, "");
  return `INC-${campaignId}-${deliveryId}-${safeKey}`;
}

async function notifyRider({ deliveryId, title, message, data }) {
  try {
    await Notification.create({
      recipient: deliveryId,
      recipientModel: "Delivery",
      userId: deliveryId,
      role: "delivery",
      title,
      message,
      body: message,
      type: "alert",
      channel: "in_app",
      provider: "internal",
      data: data || {},
    });
  } catch (err) {
    logger.warn("[incentive] notification insert failed", { error: err.message });
  }

  try {
    emitToDelivery(deliveryId, {
      event: data?.event || "incentive:updated",
      payload: { title, message, ...(data || {}), at: new Date().toISOString() },
    });
  } catch {
    // socket is optional
  }
}

async function creditProgress(progress, campaign) {
  const claimed = await IncentiveProgress.findOneAndUpdate(
    {
      _id: progress._id,
      status: "in_progress",
      completedOrders: { $gte: progress.targetOrders },
    },
    { $set: { status: "earned", earnedAt: new Date() } },
    { new: true },
  );
  if (!claimed) return { credited: false, reason: "not_claimed" };

  const amount = roundCurrency(claimed.amount);
  const deliveryId = claimed.deliveryId;
  const campaignId = claimed.campaignId;

  if (campaign.maxPayoutsPerRider) {
    const paidCount = await IncentivePayout.countDocuments({
      campaignId,
      deliveryId,
      status: "paid",
    });
    if (paidCount >= campaign.maxPayoutsPerRider) {
      await IncentiveProgress.updateOne(
        { _id: claimed._id },
        { $set: { status: "ineligible", ineligibleReason: "max_payouts" } },
      );
      return { credited: false, reason: "max_payouts" };
    }
  }

  if (campaign.budgetCap != null) {
    const budgeted = await IncentiveCampaign.findOneAndUpdate(
      {
        _id: campaignId,
        $expr: { $lte: [{ $add: ["$spentAmount", amount] }, "$budgetCap"] },
      },
      { $inc: { spentAmount: amount } },
      { new: true },
    );
    if (!budgeted) {
      await IncentiveProgress.updateOne(
        { _id: claimed._id },
        { $set: { status: "ineligible", ineligibleReason: "budget_exhausted" } },
      );
      await IncentiveCampaign.updateOne(
        { _id: campaignId, status: "active" },
        { $set: { status: "paused" } },
      );
      return { credited: false, reason: "budget_exhausted" };
    }
  } else {
    await IncentiveCampaign.updateOne({ _id: campaignId }, { $inc: { spentAmount: amount } });
  }

  const transactionRef = buildTransactionRef(campaignId, deliveryId, claimed.periodKey);

  try {
    await Transaction.create({
      user: deliveryId,
      userModel: "Delivery",
      type: "Incentive",
      amount,
      status: "Settled",
      reference: transactionRef,
      meta: {
        reason: campaign.title,
        campaignId: String(campaignId),
        periodKey: claimed.periodKey,
        targetOrders: claimed.targetOrders,
        completedOrders: claimed.completedOrders,
      },
    });

    const payout = await IncentivePayout.create({
      campaignId,
      deliveryId,
      progressId: claimed._id,
      amount,
      periodKey: claimed.periodKey,
      transactionRef,
      status: "paid",
    });

    await IncentiveProgress.updateOne(
      { _id: claimed._id },
      { $set: { payoutId: payout._id, transactionRef } },
    );

    await invalidateDeliveryCaches(deliveryId).catch(() => {});

    await notifyRider({
      deliveryId,
      title: "Incentive earned",
      message: `You completed ${claimed.targetOrders} orders and earned ₹${amount} (${campaign.title}).`,
      data: {
        event: "incentive:earned",
        campaignId: String(campaignId),
        amount,
        periodKey: claimed.periodKey,
      },
    });

    return { credited: true, amount, transactionRef };
  } catch (err) {
    if (err?.code === 11000) {
      return { credited: false, reason: "duplicate" };
    }
    await IncentiveProgress.updateOne(
      { _id: claimed._id },
      { $set: { status: "in_progress", earnedAt: null } },
    );
    await IncentiveCampaign.updateOne(
      { _id: campaignId },
      { $inc: { spentAmount: -amount } },
    );
    throw err;
  }
}

async function incrementProgress(campaign, rider, orderId, now) {
  const period = clampPeriodToCampaign(resolvePeriod(campaign, now), campaign);
  if (now < period.periodStart || now > period.periodEnd) return null;

  const orderOid = toOid(orderId);
  if (!orderOid) return null;

  const filter = {
    campaignId: campaign._id,
    deliveryId: rider._id,
    periodKey: period.periodKey,
  };

  let progress = await IncentiveProgress.findOne(filter);
  if (!progress) {
    try {
      progress = await IncentiveProgress.create({
        ...filter,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        completedOrders: 0,
        targetOrders: campaign.targetOrders,
        amount: campaign.amount,
        orderIds: [],
        status: "in_progress",
        rulesVersion: campaign.rulesVersion || 1,
      });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      progress = await IncentiveProgress.findOne(filter);
    }
  }

  if (!progress || progress.status !== "in_progress") return progress;

  const updated = await IncentiveProgress.findOneAndUpdate(
    { _id: progress._id, status: "in_progress", orderIds: { $ne: orderOid } },
    { $addToSet: { orderIds: orderOid }, $inc: { completedOrders: 1 } },
    { new: true },
  );

  if (!updated) return progress;

  if (updated.completedOrders >= updated.targetOrders) {
    await creditProgress(updated, campaign);
    return IncentiveProgress.findById(updated._id);
  }

  return updated;
}

/**
 * Called after an order is delivered and settled. Never throws to the caller.
 */
export async function evaluateIncentivesForRider(deliveryBoyId, order) {
  try {
    const riderId = toOid(deliveryBoyId);
    if (!riderId) return { evaluated: 0 };

    const orderId = order?._id || order?.id;
    if (!orderId) return { evaluated: 0 };

    const status = String(order.status || order.workflowStatus || "").toLowerCase();
    if (status !== "delivered") return { evaluated: 0 };

    const rider = await Delivery.findById(riderId).lean();
    if (!rider) return { evaluated: 0 };

    const now = order.deliveredAt ? new Date(order.deliveredAt) : new Date();
    const campaigns = await IncentiveCampaign.find({
      status: "active",
      startAt: { $lte: now },
      endAt: { $gte: now },
    }).lean();

    if (!campaigns.length) return { evaluated: 0 };

    const specificIds = campaigns
      .filter((c) => c.audienceType === "specific")
      .map((c) => c._id);

    const assignments = specificIds.length
      ? await IncentiveAssignment.find({
          campaignId: { $in: specificIds },
          deliveryId: riderId,
        })
          .select("campaignId")
          .lean()
      : [];
    const assignedCampaigns = new Set(assignments.map((a) => String(a.campaignId)));

    const lifetimeOrders = await Order.countDocuments({
      deliveryBoy: riderId,
      status: "delivered",
    });

    let evaluated = 0;
    for (const campaign of campaigns) {
      if (!isWithinCampaignWindow(campaign, now)) continue;

      const assignedIds =
        campaign.audienceType === "specific"
          ? assignedCampaigns.has(String(campaign._id))
            ? new Set([String(rider._id)])
            : new Set()
          : undefined;

      const eligible = await isRiderEligibleForCampaign(campaign, rider, {
        lifetimeOrders,
        assignedIds,
      });
      if (!eligible) continue;

      await incrementProgress(campaign, rider, orderId, now);
      evaluated += 1;
    }

    return { evaluated };
  } catch (err) {
    logger.error("[incentive] evaluation failed", {
      deliveryBoyId: String(deliveryBoyId),
      orderId: String(order?._id || ""),
      error: err.message,
      stack: err.stack,
    });
    return { evaluated: 0, error: err.message };
  }
}

export async function expireStaleProgress(now = new Date()) {
  const result = await IncentiveProgress.updateMany(
    { status: "in_progress", periodEnd: { $lt: now } },
    { $set: { status: "expired" } },
  );
  return result.modifiedCount || 0;
}

/**
 * Re-evaluate riders who delivered recently in case the live hook missed.
 */
export async function reconcileRecentDeliveries({ lookbackMs = 10 * 60 * 1000 } = {}) {
  const since = new Date(Date.now() - lookbackMs);
  const expired = await expireStaleProgress();

  const orders = await Order.find({
    status: "delivered",
    deliveryBoy: { $ne: null },
    deliveredAt: { $gte: since },
  })
    .select("_id deliveryBoy status deliveredAt workflowStatus")
    .limit(500)
    .lean();

  let evaluated = 0;
  for (const order of orders) {
    const result = await evaluateIncentivesForRider(order.deliveryBoy, order);
    evaluated += result.evaluated || 0;
  }

  return { expired, orders: orders.length, evaluated };
}

export { notifyRider };
