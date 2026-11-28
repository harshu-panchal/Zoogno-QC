import mongoose from "mongoose";
import Order from "../../models/order.js";
import Wallet from "../../models/wallet.js";
import Payout from "../../models/payout.js";
import Transaction from "../../models/transaction.js";
import FinanceAuditLog from "../../models/financeAuditLog.js";
import {
  PAYOUT_STATUS,
  PAYOUT_TYPE,
  OWNER_TYPE,
  LEDGER_TRANSACTION_TYPE,
  LEDGER_DIRECTION,
} from "../../constants/finance.js";
import { debitWalletWithCarryForward, getOrCreateWallet } from "./walletService.js";
import { createLedgerEntry } from "./ledgerService.js";

const roundCurrency = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

function payoutTypeToOwnerType(payoutType) {
  if (payoutType === PAYOUT_TYPE.SELLER) return OWNER_TYPE.SELLER;
  if (payoutType === PAYOUT_TYPE.DELIVERY_PARTNER) return OWNER_TYPE.DELIVERY_PARTNER;
  throw new Error(`Unsupported payout type: ${payoutType}`);
}

async function createFinanceAuditLog(data, { session } = {}) {
  return await FinanceAuditLog.create([data], { session });
}

/**
 * Credit a seller's settlement wallet immediately on delivery. The payout row is the
 * idempotency record; legacy PENDING rows are promoted in-place so historical delivered
 * orders can be repaired without crediting them twice.
 *
 * This function deliberately uses the caller's Mongo transaction. Delivery settlement,
 * payout status, wallet balance and ledger entry therefore commit or roll back together.
 */
export async function creditSellerSettlementForOrder(
  { order, beneficiaryId, amount, actorId = null, metadata = {} },
  { session } = {},
) {
  if (!session) throw new Error("Seller settlement credit requires a database session");
  const normalizedAmount = roundCurrency(amount || 0);
  if (!order || !beneficiaryId || normalizedAmount <= 0) return null;

  let payout = await Payout.findOne(
    {
      relatedOrderIds: order._id,
      payoutType: PAYOUT_TYPE.SELLER,
      status: { $ne: PAYOUT_STATUS.CANCELLED },
    },
    null,
    { session },
  );

  if (payout?.status === PAYOUT_STATUS.COMPLETED) return payout;

  const wallet = await getOrCreateWallet(OWNER_TYPE.SELLER, beneficiaryId, { session });
  const wasPending = Boolean(payout);
  if (!payout) {
    [payout] = await Payout.create(
      [{
        payoutType: PAYOUT_TYPE.SELLER,
        beneficiaryId,
        amount: normalizedAmount,
        status: PAYOUT_STATUS.COMPLETED,
        relatedOrderIds: [order._id],
        walletId: wallet._id,
        processedAt: new Date(),
        remarks: "Automatically credited to settlement wallet on delivery.",
        createdBy: actorId,
        metadata: { ...metadata, orderId: order.orderId, flow: "delivery_settlement_wallet" },
      }],
      { session },
    );
  } else {
    payout.amount = normalizedAmount;
    payout.status = PAYOUT_STATUS.COMPLETED;
    payout.walletId = wallet._id;
    payout.processedAt = new Date();
    payout.remarks = "Pending settlement credited to settlement wallet.";
    payout.metadata = { ...(payout.metadata || {}), ...metadata, backfilled: true };
    await payout.save({ session });
  }

  const availableBefore = roundCurrency(wallet.availableBalance || 0);
  const pendingBefore = roundCurrency(wallet.pendingBalance || 0);
  const adjustmentBefore = roundCurrency(wallet.adjustmentBalance || 0);
  const adjustmentApplied = Math.min(adjustmentBefore, normalizedAmount);
  const creditedToAvailable = roundCurrency(normalizedAmount - adjustmentApplied);

  if (wasPending) {
    wallet.pendingBalance = roundCurrency(Math.max(pendingBefore - normalizedAmount, 0));
  } else {
    wallet.totalCredited = roundCurrency((wallet.totalCredited || 0) + normalizedAmount);
  }
  wallet.adjustmentBalance = roundCurrency(adjustmentBefore - adjustmentApplied);
  wallet.availableBalance = roundCurrency(availableBefore + creditedToAvailable);
  await wallet.save({ session });

  await createLedgerEntry(
    {
      transactionId: `SELLER-SETTLEMENT-${order._id}`,
      orderId: order._id,
      payoutId: payout._id,
      walletId: wallet._id,
      actorType: OWNER_TYPE.SELLER,
      actorId: beneficiaryId,
      type: LEDGER_TRANSACTION_TYPE.SELLER_PAYOUT_PROCESSED,
      direction: LEDGER_DIRECTION.CREDIT,
      amount: normalizedAmount,
      description: `Seller settlement credited for order ${order.orderId}`,
      reference: order.orderId,
      balanceBefore: availableBefore,
      balanceAfter: wallet.availableBalance,
      metadata: { adjustmentApplied, creditedToAvailable, backfilled: wasPending },
    },
    { session },
  );

  return payout;
}

/** Reverse a delivered seller settlement exactly once, carrying any shortfall forward. */
export async function reverseSellerSettlementForOrder(
  orderOrId,
  {
    refundAmount = null,
    refundRatio = null,
    returnCharge = 0,
    fullReversal = false,
    reason = "Order returned after delivery",
    actorId = null,
  } = {},
) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const order = await Order.findById(orderOrId?._id || orderOrId).session(session);
    if (!order) throw new Error("Order not found");
    if (order.financeFlags?.sellerSettlementReversed) {
      await session.commitTransaction();
      return { order, duplicate: true, amount: order.financeFlags.sellerSettlementReversalAmount || 0 };
    }

    const payout = await Payout.findOne({
      relatedOrderIds: order._id,
      payoutType: PAYOUT_TYPE.SELLER,
      status: { $ne: PAYOUT_STATUS.CANCELLED },
    }, null, { session });
    const settlementWasCredited =
      order.financeFlags?.sellerSettlementCredited ||
      payout?.status === PAYOUT_STATUS.COMPLETED;
    const creditedAmount = roundCurrency(order.paymentBreakdown?.sellerPayoutTotal || 0);
    const productSubtotal = roundCurrency(order.paymentBreakdown?.productSubtotal || 0);
    const normalizedRefund = roundCurrency(refundAmount == null ? productSubtotal : refundAmount);
    const ratio =
      refundRatio != null
        ? Math.min(Math.max(Number(refundRatio), 0), 1)
        : fullReversal || productSubtotal <= 0
        ? 1
        : Math.min(Math.max(normalizedRefund / productSubtotal, 0), 1);
    const settlementReversal = settlementWasCredited
      ? roundCurrency(creditedAmount * ratio)
      : 0;
    const normalizedReturnCharge = roundCurrency(Math.max(Number(returnCharge) || 0, 0));
    const adjustment = roundCurrency(settlementReversal + normalizedReturnCharge);

    let debitResult = null;
    if (adjustment > 0 && order.seller) {
      debitResult = await debitWalletWithCarryForward({
        ownerType: OWNER_TYPE.SELLER,
        ownerId: order.seller,
        amount: adjustment,
        bucket: "available",
        session,
      });

      await createLedgerEntry(
        {
          transactionId: `SELLER-SETTLEMENT-REVERSAL-${order._id}`,
          orderId: order._id,
          walletId: debitResult.wallet._id,
          actorType: OWNER_TYPE.SELLER,
          actorId: order.seller,
          type: LEDGER_TRANSACTION_TYPE.SELLER_SETTLEMENT_REVERSAL,
          direction: LEDGER_DIRECTION.DEBIT,
          amount: adjustment,
          description: reason,
          reference: order.orderId,
          balanceBefore: debitResult.before,
          balanceAfter: debitResult.after,
          metadata: {
            settlementReversal,
            returnCharge: normalizedReturnCharge,
            carriedForward: debitResult.carriedForward,
          },
        },
        { session },
      );

      await Transaction.findOneAndUpdate(
        { reference: `REF-SELL-${order.orderId}` },
        {
          $set: {
            amount: -adjustment,
            status: "Settled",
            meta: { settlementReversal, returnCharge: normalizedReturnCharge },
          },
          $setOnInsert: {
            user: order.seller,
            userModel: "Seller",
            order: order._id,
            type: "Refund",
            reference: `REF-SELL-${order.orderId}`,
          },
        },
        { upsert: true, new: true, session },
      );
    }

    if (payout) {
      if ([PAYOUT_STATUS.PENDING, PAYOUT_STATUS.PROCESSING].includes(payout.status)) {
        const wallet = await getOrCreateWallet(OWNER_TYPE.SELLER, order.seller, { session });
        wallet.pendingBalance = roundCurrency(
          Math.max((wallet.pendingBalance || 0) - roundCurrency(payout.amount || 0), 0),
        );
        wallet.totalCredited = roundCurrency(
          Math.max((wallet.totalCredited || 0) - roundCurrency(payout.amount || 0), 0),
        );
        await wallet.save({ session });
        payout.status = PAYOUT_STATUS.CANCELLED;
        payout.cancelledAt = new Date();
      }
      payout.metadata = {
        ...(payout.metadata || {}),
        reversed: true,
        reversedAt: new Date(),
        reversalAmount: adjustment,
        reversalReason: reason,
      };
      await payout.save({ session });
    }

    order.financeFlags = {
      ...(order.financeFlags || {}),
      sellerSettlementReversed: true,
      sellerSettlementReversalAmount: adjustment,
    };
    order.settlementStatus = {
      ...(order.settlementStatus || {}),
      sellerPayout: "CANCELLED",
      overall: "REFUNDED",
    };
    await order.save({ session });
    await session.commitTransaction();
    return { order, duplicate: false, amount: adjustment, debitResult };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function createPendingPayoutForOrder({
  order,
  payoutType,
  beneficiaryId,
  amount,
  remarks = "Automatic payout creation on delivery.",
  metadata = {},
}) {
  if (!order || !beneficiaryId || amount <= 0) return null;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const existing = await Payout.findOne({
      relatedOrderIds: order._id,
      payoutType,
      status: { $ne: PAYOUT_STATUS.CANCELLED },
    }).session(session);

    if (existing) {
      await session.abortTransaction();
      return existing;
    }

    const ownerType = payoutTypeToOwnerType(payoutType);
    const wallet = await getOrCreateWallet(ownerType, beneficiaryId, { session });

    const payout = await Payout.create(
      [
        {
          payoutType,
          beneficiaryId,
          amount: roundCurrency(amount),
          status: PAYOUT_STATUS.PENDING,
          relatedOrderIds: [order._id],
          remarks,
          metadata: {
            ...metadata,
            orderId: order.orderId,
          },
        },
      ],
      { session },
    );

    wallet.pendingBalance = roundCurrency((wallet.pendingBalance || 0) + amount);
    wallet.totalCredited = roundCurrency((wallet.totalCredited || 0) + amount);
    await wallet.save({ session });

    await createLedgerEntry(
      {
        orderId: order._id,
        payoutId: payout[0]._id,
        walletId: wallet._id,
        actorType: ownerType,
        actorId: beneficiaryId,
        type: payoutType === PAYOUT_TYPE.SELLER 
          ? LEDGER_TRANSACTION_TYPE.SELLER_PAYOUT_PENDING 
          : LEDGER_TRANSACTION_TYPE.RIDER_PAYOUT_PENDING,
        direction: LEDGER_DIRECTION.CREDIT,
        amount: roundCurrency(amount),
        description: `${payoutType} payout queued for order ${order.orderId}`,
      },
      { session },
    );

    await session.commitTransaction();
    return payout[0];
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function processPayout(payoutId, { remarks = "", adminId = null } = {}) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const payout = await Payout.findById(payoutId).session(session);
    if (!payout) throw new Error("Payout not found.");
    if (payout.status !== PAYOUT_STATUS.PENDING && payout.status !== PAYOUT_STATUS.PROCESSING) {
      throw new Error(`Invalid payout status for processing: ${payout.status}`);
    }

    const ownerType = payoutTypeToOwnerType(payout.payoutType);
    const wallet = await getOrCreateWallet(ownerType, payout.beneficiaryId, { session });

    const amount = roundCurrency(payout.amount);
    if (wallet.pendingBalance < amount) {
      console.warn(`[Payout] Warning: Pending balance (${wallet.pendingBalance}) less than payout (${amount}) for ${ownerType} ${payout.beneficiaryId}`);
    }

    wallet.pendingBalance = roundCurrency(Math.max(0, (wallet.pendingBalance || 0) - amount));
    wallet.availableBalance = roundCurrency((wallet.availableBalance || 0) + amount);
    await wallet.save({ session });

    payout.status = PAYOUT_STATUS.COMPLETED;
    payout.processedAt = new Date();
    payout.remarks = remarks || payout.remarks;
    if (adminId) payout.createdBy = adminId;
    await payout.save({ session });

    for (const orderId of payout.relatedOrderIds) {
      const order = await Order.findById(orderId).session(session);
      if (!order) continue;

      if (payout.payoutType === PAYOUT_TYPE.SELLER) {
        order.settlementStatus = { ...(order.settlementStatus || {}), sellerPayout: "COMPLETED" };
        order.financeFlags = { ...(order.financeFlags || {}), sellerPayoutQueued: true };
      } else if (payout.payoutType === PAYOUT_TYPE.DELIVERY_PARTNER) {
        order.settlementStatus = { ...(order.settlementStatus || {}), riderPayout: "COMPLETED" };
        order.financeFlags = { ...(order.financeFlags || {}), riderPayoutQueued: true };
      }
      await order.save({ session });
    }

    await createFinanceAuditLog(
      {
        action: "PAYOUT_PROCESSED",
        actorType: OWNER_TYPE.ADMIN,
        actorId: adminId || null,
        payoutId: payout._id,
        metadata: {
          payoutType: payout.payoutType,
          beneficiaryId: String(payout.beneficiaryId),
          amount: payout.amount,
        },
      },
      { session },
    );

    await session.commitTransaction();
    return payout;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function queueSellerPayouts({ orderIds = [] } = {}) {
  const query = {
    status: "delivered",
    "settlementStatus.sellerPayout": { $ne: "COMPLETED" },
  };
  if (Array.isArray(orderIds) && orderIds.length > 0) {
    query._id = { $in: orderIds };
  }

  const orders = await Order.find(query).lean();
  const created = [];
  for (const order of orders) {
    const payout = await createPendingPayoutForOrder({
      order,
      payoutType: PAYOUT_TYPE.SELLER,
      beneficiaryId: order.seller,
      amount: order.paymentBreakdown?.sellerPayoutTotal || 0,
      metadata: { trigger: "queueSellerPayouts" },
    });
    if (payout) created.push(payout);
  }
  return created;
}

export async function queueRiderPayouts({ orderIds = [] } = {}) {
  const query = {
    status: "delivered",
    "settlementStatus.riderPayout": { $ne: "COMPLETED" },
    deliveryBoy: { $ne: null },
  };
  if (Array.isArray(orderIds) && orderIds.length > 0) {
    query._id = { $in: orderIds };
  }

  const orders = await Order.find(query).lean();
  const created = [];
  for (const order of orders) {
    const payout = await createPendingPayoutForOrder({
      order,
      payoutType: PAYOUT_TYPE.DELIVERY_PARTNER,
      beneficiaryId: order.deliveryBoy,
      amount: order.paymentBreakdown?.riderPayoutTotal || 0,
      metadata: { trigger: "queueRiderPayouts" },
    });
    if (payout) created.push(payout);
  }
  return created;
}

export async function cancelPendingPayoutForOrder(orderId, payoutType, { remarks, adminId, session: externalSession } = {}) {
  const session = externalSession || (await mongoose.startSession());
  const managedSession = !externalSession;
  if (managedSession) session.startTransaction();

  try {
    const payout = await Payout.findOne({
      relatedOrderIds: orderId,
      payoutType,
      status: { $in: [PAYOUT_STATUS.PENDING, PAYOUT_STATUS.PROCESSING] },
    }, null, { session });

    if (!payout) return null;

    const ownerType = payoutTypeToOwnerType(payout.payoutType);
    const beneficiaryWallet = await getOrCreateWallet(ownerType, payout.beneficiaryId, { session });

    const amount = roundCurrency(payout.amount);
    beneficiaryWallet.pendingBalance = roundCurrency(Math.max((beneficiaryWallet.pendingBalance || 0) - amount, 0));
    beneficiaryWallet.totalCredited = roundCurrency(Math.max((beneficiaryWallet.totalCredited || 0) - amount, 0));
    await beneficiaryWallet.save({ session });

    payout.status = PAYOUT_STATUS.CANCELLED;
    payout.remarks = remarks || `Payout cancelled due to return/reversal.`;
    payout.cancelledAt = new Date();
    if (adminId) payout.createdBy = adminId;
    await payout.save({ session });

    await createLedgerEntry(
      {
        orderId,
        payoutId: payout._id,
        walletId: beneficiaryWallet._id,
        actorType: ownerType,
        actorId: payout.beneficiaryId,
        type: LEDGER_TRANSACTION_TYPE.PAYOUT_CANCELLED || "PAYOUT_CANCELLED",
        direction: LEDGER_DIRECTION.DEBIT,
        amount,
        description: `Pending ${payout.payoutType} payout reversed due to return.`,
      },
      { session },
    );

    if (managedSession) await session.commitTransaction();
    return payout;
  } catch (error) {
    if (managedSession) await session.abortTransaction();
    throw error;
  } finally {
    if (managedSession) session.endSession();
  }
}

export const bulkProcessPayouts = async ({
  payoutIds = [],
  payoutType,
  limit = 50,
  adminId = null,
  remarks = "",
} = {}) => {
  let targets = payoutIds;
  if (!Array.isArray(targets) || targets.length === 0) {
    const query = {
      status: { $in: [PAYOUT_STATUS.PENDING, PAYOUT_STATUS.PROCESSING] },
    };
    if (payoutType) query.payoutType = payoutType;
    const list = await Payout.find(query)
      .sort({ createdAt: 1 })
      .limit(Math.max(Math.min(Number(limit) || 50, 200), 1))
      .select("_id")
      .lean();
    targets = list.map((row) => String(row._id));
  }

  const results = [];
  for (const id of targets) {
    try {
      const payout = await processPayout(id, { remarks, adminId });
      results.push({
        payoutId: String(payout._id),
        status: "COMPLETED",
      });
    } catch (error) {
      results.push({
        payoutId: String(id),
        status: "FAILED",
        reason: error.message,
      });
    }
  }

  return {
    total: results.length,
    completed: results.filter((row) => row.status === "COMPLETED").length,
    failed: results.filter((row) => row.status === "FAILED").length,
    results,
  };
}
