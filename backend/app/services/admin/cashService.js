import Delivery from "../../models/delivery.js";
import Transaction from "../../models/transaction.js";
import Notification from "../../models/notification.js";
import { updateCashInHand } from "../finance/walletService.js";
import { createLedgerEntry } from "../finance/ledgerService.js";
import {
  OWNER_TYPE,
  LEDGER_DIRECTION,
  LEDGER_TRANSACTION_TYPE,
} from "../../constants/finance.js";

export async function getDeliveryCashBalancesData({ page, limit, skip }) {
  const ridersPipeline = [
    {
      $lookup: {
        from: "transactions",
        localField: "_id",
        foreignField: "user",
        as: "allTransactions",
      },
    },
    {
      $lookup: {
        from: "orders",
        localField: "_id",
        foreignField: "deliveryBoy",
        as: "allOrders",
      },
    },
    {
      $lookup: {
        from: "wallets",
        let: { deliveryId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$ownerType", "DELIVERY_PARTNER"] },
                  { $eq: ["$ownerId", "$$deliveryId"] }
                ]
              }
            }
          }
        ],
        as: "wallet"
      }
    },
    {
      $unwind: {
        path: "$wallet",
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $project: {
        name: 1,
        phone: 1,
        profileImage: 1,
        documents: 1,
        limit: { $ifNull: ["$limit", 5000] },
        currentCash: { $ifNull: ["$wallet.cashInHand", 0] },
        pendingOrders: {
          $size: {
            $filter: {
              input: "$allOrders",
              as: "order",
              cond: {
                $and: [
                  {
                    $in: [
                      "$$order.status",
                      ["confirmed", "packed", "picked_up", "out_for_delivery"],
                    ],
                  },
                  { $in: ["$$order.payment.method", ["cash", "cod"]] },
                ],
              },
            },
          },
        },
        totalOrders: {
          $size: {
            $filter: {
              input: "$allOrders",
              as: "order",
              cond: { $eq: ["$$order.status", "delivered"] },
            },
          },
        },
        lastSettlementTxn: {
          $arrayElemAt: [
            {
              $sortArray: {
                input: {
                  $filter: {
                    input: "$allTransactions",
                    as: "transaction",
                    cond: {
                      $eq: ["$$transaction.type", "Cash Settlement"],
                    },
                  },
                },
                sortBy: { createdAt: -1 },
              },
            },
            0,
          ],
        },
      },
    },
    {
      $project: {
        id: "$_id",
        name: { $ifNull: ["$name", "Unknown Rider"] },
        phone: 1,
        avatar: {
          $cond: [
            { $gt: [{ $strLenCP: { $ifNull: ["$profileImage", ""] } }, 0] },
            "$profileImage",
            {
              $cond: [
                { $gt: [{ $strLenCP: { $ifNull: ["$documents.profileImage", ""] } }, 0] },
                "$documents.profileImage",
                {
                  $concat: [
                    "https://api.dicebear.com/7.x/avataaars/svg?seed=",
                    { $ifNull: ["$name", "rider"] },
                  ],
                },
              ],
            },
          ],
        },
        currentCash: 1,
        limit: 1,
        status: {
          $cond: [
            { $gt: ["$currentCash", 4500] },
            "critical",
            {
              $cond: [
                { $gt: ["$currentCash", 3000] },
                "warning",
                "safe",
              ],
            },
          ],
        },
        pendingOrders: 1,
        totalOrders: 1,
        lastSettlement: {
          $ifNull: ["$lastSettlementTxn.createdAt", "Never"],
        },
      },
    },
    {
      $facet: {
        meta: [{ $count: "total" }],
        items: [{ $skip: skip }, { $limit: limit }],
      },
    },
  ];

  const [aggregateResult] = await Delivery.aggregate(ridersPipeline);
  const meta = aggregateResult?.meta?.[0];
  const riders = aggregateResult?.items ?? [];
  const total = meta?.total ?? 0;

  const totalInHand = riders.reduce(
    (accumulator, rider) => accumulator + (rider.currentCash || 0),
    0,
  );
  const overLimitCount = riders.filter(
    (rider) => (rider.currentCash || 0) >= (rider.limit || 5000),
  ).length;

  return {
    items: riders,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
    stats: {
      totalInHand,
      overLimitCount,
      avgBalance: riders.length ? totalInHand / riders.length : 0,
    },
  };
}

export async function settleRiderCashEntry({ riderId, amount, method }) {
  if (!riderId || !amount || amount <= 0) {
    throw new Error("Missing riderId or invalid amount");
  }

  const rider = await Delivery.findById(riderId);
  if (!rider) {
    return null;
  }

  const settlement = await Transaction.create({
    user: riderId,
    userModel: "Delivery",
    type: "Cash Settlement",
    amount: -Math.abs(amount),
    status: "Settled",
    reference: `CSH-SET-${Date.now()}`,
    notes: `Method: ${method || "Cash"}`,
    meta: { method: method || "Cash" },
  });

  const updateResult = await updateCashInHand({
    ownerType: OWNER_TYPE.DELIVERY_PARTNER,
    ownerId: riderId,
    deltaAmount: -Math.abs(amount),
  });

  try {
    await createLedgerEntry({
      actorType: OWNER_TYPE.DELIVERY_PARTNER,
      actorId: riderId,
      type: LEDGER_TRANSACTION_TYPE.COD_REMITTED || "COD_REMITTED",
      direction: LEDGER_DIRECTION.DEBIT,
      amount: Math.abs(amount),
      paymentMode: method || "CASH",
      description: `Cash deposited to admin: ₹${amount}`,
      reference: settlement.reference,
      balanceBefore: updateResult?.before,
      balanceAfter: updateResult?.after,
    });
  } catch (ledgerErr) {
    console.error("Failed to create ledger entry for cash settlement:", ledgerErr);
  }

  await Notification.create({
    recipient: riderId,
    recipientModel: "Delivery",
    title: "Cash Settled",
    message: `Admin has collected ₹${amount} cash from you. Your balance is updated.`,
    type: "payment",
    data: { transactionId: settlement._id },
  });

  return settlement;
}

export async function getRiderCashDetailsData(riderId) {
  const transactions = await Transaction.find({
    user: riderId,
    userModel: "Delivery",
    type: "Cash Collection",
  })
    .populate("order", "orderId pricing createdAt")
    .sort({ createdAt: -1 })
    .limit(20);

  return transactions.map((transaction) => ({
    id: transaction.order?.orderId || transaction.reference || "N/A",
    reference: transaction.reference || transaction.order?.orderId || "N/A",
    amount: transaction.amount,
    time: new Date(transaction.createdAt).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    date: transaction.createdAt,
    createdAt: transaction.createdAt,
  }));
}

export async function getCashSettlementHistoryData({ page, limit, skip }) {
  const query = { userModel: "Delivery", type: "Cash Settlement" };

  const [history, total] = await Promise.all([
    Transaction.find(query)
      .populate("user", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Transaction.countDocuments(query),
  ]);

  const items = history.map((entry) => ({
    id: (entry.reference || entry._id).toString(),
    rider: entry.user?.name || "Unknown Rider",
    amount: Math.abs(entry.amount),
    date: entry.createdAt,
    createdAt: entry.createdAt,
    method: entry.meta?.method || entry.notes?.replace("Method: ", "") || "Cash Submission",
    status: "completed",
  }));

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function getCodCollectionHistoryData({ page, limit, skip, search = "" }) {
  const Order = (await import("../../models/order.js")).default;

  const filter = {
    paymentMode: "COD",
    $or: [
      { "financeFlags.codMarkedCollected": true },
      { paymentStatus: { $in: ["PAID", "CASH_COLLECTED", "PARTIALLY_REMITTED", "COD_RECONCILED"] } },
      { codCollectionMethod: { $in: ["CASH", "UPI_QR"] } },
    ],
  };

  if (search && String(search).trim()) {
    const q = String(search).trim();
    filter.$and = [
      {
        $or: [
          { orderId: { $regex: q, $options: "i" } },
          { "address.name": { $regex: q, $options: "i" } },
        ],
      },
    ];
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate("customer", "name")
      .populate("deliveryBoy", "name")
      .sort({ "codCollection.collectedAt": -1, updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);

  const items = orders.map((order) => {
    const amount = Number(
      order.paymentBreakdown?.codCollectedAmount ||
        order.paymentBreakdown?.grandTotal ||
        order.pricing?.total ||
        0,
    );
    const method = order.codCollectionMethod === "UPI_QR" ? "UPI_QR" : "CASH";
    return {
      orderId: order.orderId,
      customerName: order.customer?.name || order.address?.name || "Customer",
      amount,
      collectionMethod: method,
      paymentStatus: order.paymentStatus,
      transactionId:
        order.codCollection?.transactionId ||
        order.payment?.transactionId ||
        null,
      deliveryPartner: order.deliveryBoy?.name || "Unassigned",
      paidAt: order.codCollection?.collectedAt || order.deliveredAt || order.updatedAt,
    };
  });

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

