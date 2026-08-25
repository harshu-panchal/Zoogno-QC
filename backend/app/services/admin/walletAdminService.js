import Transaction from "../../models/transaction.js";
import Delivery from "../../models/delivery.js";
import Notification from "../../models/notification.js";
import { getAdminFinanceSummary, debitWallet } from "../finance/walletService.js";
import { getLedgerEntries } from "../finance/ledgerService.js";
import { invalidateDeliveryCaches } from "../delivery/deliveryEarningsService.js";

export async function getAdminWalletOverview({ page, limit }) {
  const stats = await getAdminFinanceSummary();
  const ledger = await getLedgerEntries({ page, limit });
  const transactionItems = ledger.items.map((entry) => ({
    id: entry.transactionId || entry.reference || String(entry._id),
    type: entry.type,
    amount:
      entry.direction === "DEBIT"
        ? -Math.abs(entry.amount || 0)
        : Math.abs(entry.amount || 0),
    status: entry.status,
    sender: entry.direction === "DEBIT" ? entry.actorType : "System/Order",
    recipient: entry.direction === "CREDIT" ? entry.actorType : "Platform Wallet",
    date: new Date(entry.createdAt).toLocaleDateString(),
    time: new Date(entry.createdAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    notes: entry.description || entry.type,
    method: entry.paymentMode || "N/A",
  }));

  return {
    stats: {
      totalPlatformEarning: stats.totalPlatformEarning,
      totalAdminEarning: stats.totalAdminEarning,
      availableBalance: stats.availableBalance,
      sellerPendingPayouts: stats.sellerPendingPayouts,
      deliveryPendingPayouts: stats.deliveryPendingPayouts,
      systemFloat: stats.systemFloatCOD,
    },
    transactions: {
      items: transactionItems,
      page: ledger.page,
      limit: ledger.limit,
      total: ledger.total,
      totalPages: ledger.totalPages,
    },
  };
}

export async function getDeliveryTransactionsData({
  page,
  limit,
  skip,
  status,
  type,
  riderId,
  period,
  startDate,
  endDate,
  search,
}) {
  const query = { userModel: "Delivery" };

  if (status && status !== "all") {
    if (status.toLowerCase() === "settled" || status.toLowerCase() === "paid") {
      query.status = { $in: ["Settled", "Completed", "settled", "completed"] };
    } else if (status.toLowerCase() === "pending") {
      query.status = { $in: ["Pending", "pending"] };
    } else {
      query.status = { $regex: new RegExp(`^${status}$`, "i") };
    }
  }
  if (type && type !== "all") {
    if (type === "earning") {
      query.type = { $in: ["Delivery Earning", "Incentive", "Bonus"] };
    } else if (type === "payout") {
      query.type = { $in: ["Withdrawal", "Payout"] };
    } else if (type === "cash") {
      query.type = "Cash Collection";
    } else if (type === "settlement") {
      query.type = "Cash Settlement";
    } else {
      query.type = { $regex: new RegExp(`^${type}$`, "i") };
    }
  }
  if (riderId && riderId !== "all") {
    query.user = riderId;
  }

  if (search && search.trim()) {
    const searchRegex = new RegExp(search.trim(), "i");
    const matchingRiders = await Delivery.find({
      $or: [{ name: searchRegex }, { phone: searchRegex }],
    }).select("_id").lean();
    const riderIds = matchingRiders.map((r) => r._id);

    query.$or = [
      { reference: searchRegex },
      { user: { $in: riderIds } },
    ];
  }

  const dateRange = getPeriodDateRange(period, startDate, endDate);
  if (dateRange) {
    query.createdAt = { $gte: dateRange.start, $lte: dateRange.end };
  }

  const transactions = await Transaction.find(query)
    .populate("user", "name phone profileImage vehicleType vehicleNumber accountHolder accountNumber ifsc upiId")
    .populate({
      path: "order",
      select: "orderId pricing payment distance address createdAt",
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await Transaction.countDocuments(query);

  const statsMatch = { userModel: "Delivery" };
  if (riderId && riderId !== "all") {
    statsMatch.user = riderId;
  }
  if (dateRange) {
    statsMatch.createdAt = { $gte: dateRange.start, $lte: dateRange.end };
  }

  const [statsResult] = await Transaction.aggregate([
    { $match: statsMatch },
    {
      $group: {
        _id: null,
        totalEarnings: {
          $sum: {
            $cond: [
              { $in: ["$type", ["Delivery Earning", "Incentive", "Bonus"]] },
              "$amount",
              0,
            ],
          },
        },
        totalPayouts: {
          $sum: {
            $cond: [
              { $in: ["$type", ["Withdrawal", "Payout"]] },
              { $abs: "$amount" },
              0,
            ],
          },
        },
        totalCashCollected: {
          $sum: {
            $cond: [{ $eq: ["$type", "Cash Collection"] }, "$amount", 0],
          },
        },
        totalCashSettled: {
          $sum: {
            $cond: [
              { $eq: ["$type", "Cash Settlement"] },
              { $abs: "$amount" },
              0,
            ],
          },
        },
        pendingSettlements: {
          $sum: {
            $cond: [
              { $eq: [{ $toLower: "$status" }, "pending"] },
              { $abs: "$amount" },
              0,
            ],
          },
        },
      },
    },
  ]);

  const stats = {
    totalEarnings: statsResult ? Math.round(statsResult.totalEarnings * 100) / 100 : 0,
    totalPayouts: statsResult ? Math.round(statsResult.totalPayouts * 100) / 100 : 0,
    totalCashCollected: statsResult ? Math.round(statsResult.totalCashCollected * 100) / 100 : 0,
    totalCashSettled: statsResult ? Math.round(statsResult.totalCashSettled * 100) / 100 : 0,
    pendingSettlements: statsResult ? Math.round(statsResult.pendingSettlements * 100) / 100 : 0,
  };

  return {
    items: transactions,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
    stats,
    periodRange: dateRange ? { start: dateRange.start, end: dateRange.end } : null,
  };
}

export function getPeriodDateRange(period, customStart, customEnd) {
  const now = new Date();
  if (period === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (period === "this_week" || period === "weekly") {
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const start = new Date(now);
    start.setDate(now.getDate() + diffToMonday);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (period === "last_week") {
    const day = now.getDay();
    const diffToMonday = (day === 0 ? -6 : 1 - day) - 7;
    const start = new Date(now);
    start.setDate(now.getDate() + diffToMonday);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (period === "this_month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }
  if (customStart || customEnd) {
    const start = customStart ? new Date(customStart) : new Date(0);
    const end = customEnd ? new Date(customEnd) : new Date();
    if (customEnd) end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  return null;
}

export async function getSellerWithdrawalsData({ page, limit, skip, status, period, startDate, endDate }) {
  const query = { userModel: "Seller", type: "Withdrawal" };
  if (status && status !== "all") {
    query.status = { $regex: new RegExp(`^${status}$`, "i") };
  }
  const dateRange = getPeriodDateRange(period, startDate, endDate);
  if (dateRange) {
    query.createdAt = { $gte: dateRange.start, $lte: dateRange.end };
  }

  const [transactions, total] = await Promise.all([
    Transaction.find(query)
      .populate("user", "name shopName phone bankDetails upiDetails")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Transaction.countDocuments(query),
  ]);

  return {
    items: transactions,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
    periodRange: dateRange ? { start: dateRange.start, end: dateRange.end } : null,
  };
}

export async function getSellerTransactionsData({ page, limit, skip }) {
  const query = { userModel: "Seller" };
  const transactions = await Transaction.find(query)
    .populate("user", "name shopName phone bankDetails")
    .populate({
      path: "order",
      select: "orderId pricing",
      populate: {
        path: "items.product",
        select: "name",
      },
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await Transaction.countDocuments(query);

  const [statsResult] = await Transaction.aggregate([
    { $match: query },
    {
      $lookup: {
        from: "orders",
        localField: "order",
        foreignField: "_id",
        as: "orderData"
      }
    },
    { $unwind: { path: "$orderData", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: null,
        totalGross: {
          $sum: { $cond: [{ $eq: ["$type", "Seller Earning"] }, "$amount", 0] }
        },
        totalCommission: {
          $sum: { 
            $cond: [
              { $eq: ["$type", "Seller Earning"] }, 
              { $ifNull: ["$orderData.pricing.platformFee", 0] }, 
              0
            ] 
          }
        },
        totalPayouts: {
          $sum: {
            $cond: [
              { $in: ["$type", ["Withdrawal", "Payout"]] },
              { $abs: "$amount" },
              0
            ] 
          }
        },
        totalRefunds: {
          $sum: {
            $cond: [
              { $eq: ["$type", "Refund"] },
              { $abs: "$amount" },
              0
            ] 
          }
        },
        pendingSettlements: {
          $sum: {
            $cond: [
              { $eq: [{ $toLower: "$status" }, "pending"] },
              { $abs: "$amount" },
              0
            ] 
          }
        }
      }
    }
  ]);

  const stats = {
    totalGross: statsResult ? statsResult.totalGross : 0,
    totalCommission: statsResult ? statsResult.totalCommission : 0,
    totalPayouts: statsResult ? statsResult.totalPayouts : 0,
    totalRefunds: statsResult ? statsResult.totalRefunds : 0,
    pendingSettlements: statsResult ? statsResult.pendingSettlements : 0,
  };

  return {
    items: transactions,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
    stats,
  };
}

export async function getDeliveryWithdrawalsData({ page, limit, skip, status, period, startDate, endDate }) {
  const query = { userModel: "Delivery", type: "Withdrawal" };
  if (status && status !== "all") {
    query.status = { $regex: new RegExp(`^${status}$`, "i") };
  }
  const dateRange = getPeriodDateRange(period, startDate, endDate);
  if (dateRange) {
    query.createdAt = { $gte: dateRange.start, $lte: dateRange.end };
  }

  const [transactions, total] = await Promise.all([
    Transaction.find(query)
      .populate("user", "name phone accountHolder accountNumber ifsc upiId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Transaction.countDocuments(query),
  ]);

  return {
    items: transactions,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
    periodRange: dateRange ? { start: dateRange.start, end: dateRange.end } : null,
  };
}

export async function updateWithdrawalStatusById({ id, status, reason }) {
  if (!["Settled", "Failed", "Processing"].includes(status)) {
    throw new Error("Invalid status");
  }

  const transaction = await Transaction.findById(id).populate("user", "name");
  if (!transaction) {
    return null;
  }

  const previousStatus = transaction.status;

  transaction.status = status;
  if (reason) {
    transaction.notes = reason;
  }

  await transaction.save();

  if (status === "Settled" && previousStatus !== "Settled" && transaction.type === "Withdrawal") {
    try {
      const ownerType = transaction.userModel === "Seller" ? "SELLER" : "DELIVERY_PARTNER";
      await debitWallet({
        ownerType,
        ownerId: transaction.user._id,
        amount: Math.abs(transaction.amount),
        bucket: "available",
      });
    } catch (err) {
      console.error("[WalletAdminService] Wallet debit failed during settlement:", err.message);
    }
  }

  if (transaction.userModel === "Delivery") {
    await invalidateDeliveryCaches(transaction.user._id).catch(() => {});
  }

  return transaction;
}

export async function settleDeliveryTransactionById(id) {
  // Withdrawals must go through updateWithdrawalStatusById, which actually debits
  // the rider's wallet \u2014 this generic settle path only flips a status flag, and
  // marking a withdrawal "Settled" here would tell the rider they've been paid
  // when no money has moved. Guard by type, atomically, rather than checking
  // after the write.
  const transaction = await Transaction.findOneAndUpdate(
    { _id: id, type: { $ne: "Withdrawal" } },
    { status: "Settled" },
    { new: true },
  ).populate("user", "name");

  if (!transaction) {
    const existing = await Transaction.findById(id).select("type");
    if (existing?.type === "Withdrawal") {
      throw new Error(
        "Withdrawals can't be settled here \u2014 use the Withdrawals approval flow instead.",
      );
    }
    return null;
  }

  await Notification.create({
    recipient: transaction.user._id,
    recipientModel: "Delivery",
    title: "Payment Settled",
    message: `Your payment of \u20B9${transaction.amount} has been settled.`,
    type: "payment",
    data: { transactionId: transaction._id },
  });

  await invalidateDeliveryCaches(transaction.user._id).catch(() => {});

  return transaction;
}

export async function bulkSettleDeliveryTransactions() {
  const query = { userModel: "Delivery", status: "Pending", type: { $ne: "Withdrawal" } };
  const affectedRiderIds = await Transaction.distinct("user", query);

  const result = await Transaction.updateMany(query, { status: "Settled" });

  await Promise.all(
    affectedRiderIds.map((riderId) => invalidateDeliveryCaches(riderId).catch(() => {})),
  );

  return result;
}
