import mongoose from "mongoose";
import Order from "../../models/order.js";
import Seller from "../../models/seller.js";
import Delivery from "../../models/delivery.js";
import SettlementPayout, {
  BENEFICIARY_TYPE,
  SETTLEMENT_PAYOUT_STATUS,
  COMMITTED_PAYOUT_STATUSES,
  PAYOUT_CHANNEL,
} from "../../models/settlementPayout.js";
import { getSettlementDateRange } from "../../utils/settlementPeriod.js";
import { roundCurrency } from "../../utils/money.js";
import { sendSettlementEmail } from "../emailService.js";
import { fetchAndApplyTransferStatus } from "./cashfreePayoutService.js";
import { cashfreePayoutAdapter } from "../payment/providers/cashfreePayout.adapter.js";

const EARNING_FIELD_BY_TYPE = {
  [BENEFICIARY_TYPE.SELLER]: "paymentBreakdown.sellerPayoutTotal",
  [BENEFICIARY_TYPE.DELIVERY_PARTNER]: "paymentBreakdown.riderPayoutTotal",
};

const OWNER_FIELD_BY_TYPE = {
  [BENEFICIARY_TYPE.SELLER]: "seller",
  [BENEFICIARY_TYPE.DELIVERY_PARTNER]: "deliveryBoy",
};

const SETTLEMENT_STATUS_FIELD_BY_TYPE = {
  [BENEFICIARY_TYPE.SELLER]: "settlementStatus.sellerPayout",
  [BENEFICIARY_TYPE.DELIVERY_PARTNER]: "settlementStatus.riderPayout",
};

// Any order whose payout sub-status reaches this point has an earning the
// beneficiary is entitled to, regardless of whether the (unrelated, legacy)
// batch-payout pipeline has "processed" it. NOT_APPLICABLE/CANCELLED orders
// never earned money for this beneficiary and HOLD orders are inside their
// return window, so none of those count as eligible earnings yet.
const ELIGIBLE_PAYOUT_SUBSTATUSES = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"];

const BENEFICIARY_MODEL = {
  [BENEFICIARY_TYPE.SELLER]: Seller,
  [BENEFICIARY_TYPE.DELIVERY_PARTNER]: Delivery,
};

function assertBeneficiaryType(beneficiaryType) {
  if (!Object.values(BENEFICIARY_TYPE).includes(beneficiaryType)) {
    throw new Error(`Invalid beneficiary type: ${beneficiaryType}`);
  }
}

function dateMatchStage(dateField, dateRange) {
  if (!dateRange) return {};
  return { [dateField]: { $gte: dateRange.start, $lte: dateRange.end } };
}

/**
 * Sum of eligible order earnings for one beneficiary. Earnings always come
 * from Order.paymentBreakdown (frozen at settlement time), never from payout
 * records — see requirement: earnings and payouts are separate concepts.
 */
export async function getEligibleEarnings(beneficiaryType, beneficiaryId, dateRange = null) {
  assertBeneficiaryType(beneficiaryType);
  const ownerField = OWNER_FIELD_BY_TYPE[beneficiaryType];
  const statusField = SETTLEMENT_STATUS_FIELD_BY_TYPE[beneficiaryType];
  const earningField = EARNING_FIELD_BY_TYPE[beneficiaryType];

  const match = {
    [ownerField]: new mongoose.Types.ObjectId(beneficiaryId),
    [statusField]: { $in: ELIGIBLE_PAYOUT_SUBSTATUSES },
    ...dateMatchStage("deliveredAt", dateRange),
  };

  const [result] = await Order.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: `$${earningField}` } } },
  ]);

  return roundCurrency(result?.total || 0);
}

/** Sum of successful (PAID) manual payouts for one beneficiary. */
export async function getTotalPaid(beneficiaryType, beneficiaryId, dateRange = null) {
  assertBeneficiaryType(beneficiaryType);

  const match = {
    beneficiaryId: new mongoose.Types.ObjectId(beneficiaryId),
    beneficiaryType,
    status: SETTLEMENT_PAYOUT_STATUS.PAID,
    ...dateMatchStage("paymentDate", dateRange),
  };

  const [result] = await SettlementPayout.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);

  return roundCurrency(result?.total || 0);
}

function bucket(earned, paid) {
  const earnedR = roundCurrency(earned);
  const paidR = roundCurrency(paid);
  return {
    earned: earnedR,
    paid: paidR,
    remaining: roundCurrency(Math.max(0, earnedR - paidR)),
  };
}

/** Today/this-week/this-month/overall earned-paid-remaining for one beneficiary. */
export async function getBeneficiarySummary(beneficiaryType, beneficiaryId) {
  assertBeneficiaryType(beneficiaryType);

  const periods = {
    today: getSettlementDateRange("today"),
    thisWeek: getSettlementDateRange("this_week"),
    thisMonth: getSettlementDateRange("this_month"),
  };

  const [
    todayEarned, todayPaid,
    weekEarned, weekPaid,
    monthEarned, monthPaid,
    overallEarned, overallPaid,
  ] = await Promise.all([
    getEligibleEarnings(beneficiaryType, beneficiaryId, periods.today),
    getTotalPaid(beneficiaryType, beneficiaryId, periods.today),
    getEligibleEarnings(beneficiaryType, beneficiaryId, periods.thisWeek),
    getTotalPaid(beneficiaryType, beneficiaryId, periods.thisWeek),
    getEligibleEarnings(beneficiaryType, beneficiaryId, periods.thisMonth),
    getTotalPaid(beneficiaryType, beneficiaryId, periods.thisMonth),
    getEligibleEarnings(beneficiaryType, beneficiaryId, null),
    getTotalPaid(beneficiaryType, beneficiaryId, null),
  ]);

  return {
    today: bucket(todayEarned, todayPaid),
    thisWeek: bucket(weekEarned, weekPaid),
    thisMonth: bucket(monthEarned, monthPaid),
    overall: bucket(overallEarned, overallPaid),
  };
}

/**
 * Overall remaining payable — the number every new payout is validated
 * against. Counts PENDING/PROCESSING Cashfree transfers as already
 * "committed" (not just confirmed PAID ones), so a second payout can never
 * be created against money an in-flight transfer already has a claim on.
 */
export async function getRemainingPayable(beneficiaryType, beneficiaryId, session = null) {
  assertBeneficiaryType(beneficiaryType);
  const ownerField = OWNER_FIELD_BY_TYPE[beneficiaryType];
  const statusField = SETTLEMENT_STATUS_FIELD_BY_TYPE[beneficiaryType];
  const earningField = EARNING_FIELD_BY_TYPE[beneficiaryType];

  const earningsAgg = Order.aggregate([
    {
      $match: {
        [ownerField]: new mongoose.Types.ObjectId(beneficiaryId),
        [statusField]: { $in: ELIGIBLE_PAYOUT_SUBSTATUSES },
      },
    },
    { $group: { _id: null, total: { $sum: `$${earningField}` } } },
  ]);
  if (session) earningsAgg.session(session);

  const committedAgg = SettlementPayout.aggregate([
    {
      $match: {
        beneficiaryId: new mongoose.Types.ObjectId(beneficiaryId),
        beneficiaryType,
        status: { $in: COMMITTED_PAYOUT_STATUSES },
      },
    },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  if (session) committedAgg.session(session);

  const [[earningsResult], [committedResult]] = await Promise.all([earningsAgg, committedAgg]);

  const earned = roundCurrency(earningsResult?.total || 0);
  const committed = roundCurrency(committedResult?.total || 0);
  return { earned, committed, remaining: roundCurrency(Math.max(0, earned - committed)) };
}

/**
 * Creates a manual settlement payout record after re-validating the remaining
 * payable amount inside a transaction, so two concurrent admin requests can
 * never jointly overpay a beneficiary.
 *
 * All settlements are now processed manually (no Cashfree routing). The payout
 * is immediately marked as PAID/MANUAL. An email is sent to the beneficiary
 * after the DB record is committed.
 */
export async function createPayout({
  beneficiaryType,
  beneficiaryId,
  amount,
  paymentMethod,
  transactionReference,
  paymentDate,
  notes,
  adminId,
  adminName,
}) {
  assertBeneficiaryType(beneficiaryType);

  const numericAmount = roundCurrency(Number(amount));
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error("Settlement amount must be greater than zero");
  }

  const BeneficiaryModel = BENEFICIARY_MODEL[beneficiaryType];
  const beneficiary = await BeneficiaryModel.findById(beneficiaryId)
    .select("_id name shopName email phone")
    .lean();
  if (!beneficiary) {
    throw new Error("Beneficiary not found");
  }

  let previousRemaining = 0;
  let remainingAfter = 0;
  const session = await mongoose.startSession();
  let payout;
  try {
    await session.withTransaction(async () => {
      const { remaining } = await getRemainingPayable(beneficiaryType, beneficiaryId, session);
      previousRemaining = remaining;

      if (numericAmount > remaining) {
        throw new Error(
          `Settlement amount ₹${numericAmount} exceeds the remaining payable amount of ₹${remaining}. Please enter a valid amount.`
        );
      }

      remainingAfter = roundCurrency(Math.max(0, remaining - numericAmount));

      [payout] = await SettlementPayout.create(
        [
          {
            beneficiaryType,
            beneficiaryId,
            amount: numericAmount,
            paymentMethod: paymentMethod || "CASH",
            payoutChannel: PAYOUT_CHANNEL.MANUAL,
            transactionReference: transactionReference || null,
            paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
            notes: notes || "",
            status: SETTLEMENT_PAYOUT_STATUS.PAID,
            createdBy: adminId,
            createdByName: adminName || "",
          },
        ],
        { session },
      );
    });
  } finally {
    session.endSession();
  }

  // Send email notification to the beneficiary after the DB transaction
  // completes successfully. Email failure must never roll back the settlement.
  try {
    const beneficiaryEmail = beneficiary.email;
    const beneficiaryName = beneficiary.shopName || beneficiary.name || "Valued Partner";
    const userType =
      beneficiaryType === BENEFICIARY_TYPE.SELLER ? "Seller" : "Delivery Boy";

    await sendSettlementEmail({
      email: beneficiaryEmail,
      name: beneficiaryName,
      userType,
      settlementId: payout.payoutId,
      settlementAmount: numericAmount,
      previousBalance: previousRemaining,
      remainingBalance: remainingAfter,
      settlementDate: payout.paymentDate,
      processedBy: adminName || "Admin",
    });
  } catch (emailError) {
    // Log but never throw — the settlement itself succeeded.
    console.error("[settlement] Email notification failed (non-fatal):", emailError?.message);
  }

  return payout;
}

/** Reverses a payout (never hard-deletes financial records). */
export async function cancelPayout(payoutId, { adminId, adminName, reason }) {
  const payout = await SettlementPayout.findOne({ payoutId });
  if (!payout) {
    throw new Error("Payout not found");
  }
  if (payout.status === SETTLEMENT_PAYOUT_STATUS.CANCELLED) {
    throw new Error("Payout is already cancelled");
  }
  if (payout.payoutChannel === PAYOUT_CHANNEL.CASHFREE && payout.status === SETTLEMENT_PAYOUT_STATUS.PAID) {
    throw new Error("This payout was already disbursed via Cashfree — the funds have left the account and cannot be cancelled here. Recover the money through Cashfree/the beneficiary directly if needed.");
  }

  payout.status = SETTLEMENT_PAYOUT_STATUS.CANCELLED;
  payout.cancelledBy = adminId;
  payout.cancelledByName = adminName || "";
  payout.cancelledAt = new Date();
  payout.cancelReason = reason || "";
  await payout.save();

  return payout;
}

/** Manual/fallback reconciliation — re-fetches a Cashfree transfer's status
 * and applies it, for use by the webhook handler and an admin "Refresh
 * Status" action alike. */
export async function reconcileCashfreeTransferStatus(payoutId) {
  const payout = await SettlementPayout.findOne({ payoutId });
  if (!payout) {
    throw new Error("Payout not found");
  }
  if (payout.payoutChannel !== PAYOUT_CHANNEL.CASHFREE) {
    throw new Error("This payout was not sent via Cashfree");
  }
  return fetchAndApplyTransferStatus(payout);
}

/** Applies a webhook-reported status update by transferId (== payoutId). */
export async function applyCashfreeWebhookUpdate({ transferId, status, statusCode, statusDescription, cfTransferId, raw }) {
  const payout = await SettlementPayout.findOne({ payoutId: transferId, payoutChannel: PAYOUT_CHANNEL.CASHFREE });
  if (!payout) {
    return null;
  }
  if (payout.status === SETTLEMENT_PAYOUT_STATUS.PAID || payout.status === SETTLEMENT_PAYOUT_STATUS.CANCELLED) {
    // Already resolved to a terminal state — ignore late/duplicate webhooks.
    return payout;
  }

  const mapped = cashfreePayoutAdapter.mapCashfreeStatus(status);

  payout.cashfreeReferenceId = cfTransferId || payout.cashfreeReferenceId;
  payout.cashfreeStatus = status || payout.cashfreeStatus;
  payout.cashfreeStatusCode = statusCode || payout.cashfreeStatusCode;
  payout.cashfreeStatusDescription = statusDescription || payout.cashfreeStatusDescription;
  payout.cashfreeRawResponse = raw || payout.cashfreeRawResponse;

  if (mapped === "FAILED") {
    payout.status = SETTLEMENT_PAYOUT_STATUS.FAILED;
    payout.failureReason = statusDescription || status || "Transfer failed";
  } else {
    payout.status = mapped;
  }

  await payout.save();
  return payout;
}

export async function getPayoutHistory(beneficiaryType, beneficiaryId, { page = 1, limit = 20 } = {}) {
  assertBeneficiaryType(beneficiaryType);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    SettlementPayout.find({ beneficiaryId, beneficiaryType })
      .sort({ paymentDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SettlementPayout.countDocuments({ beneficiaryId, beneficiaryType }),
  ]);

  return { items, page, limit, total, totalPages: Math.ceil(total / limit) || 1 };
}

export async function getPayoutById(payoutId) {
  const payout = await SettlementPayout.findOne({ payoutId })
    .populate("beneficiaryId", "name shopName phone email")
    .lean();
  if (!payout) {
    throw new Error("Payout not found");
  }
  return payout;
}

export async function listPayouts({
  beneficiaryType,
  status,
  page = 1,
  limit = 20,
  dateRange = null,
} = {}) {
  const query = {};
  if (beneficiaryType) query.beneficiaryType = beneficiaryType;
  if (status) query.status = status;
  if (dateRange) query.paymentDate = { $gte: dateRange.start, $lte: dateRange.end };

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    SettlementPayout.find(query)
      .populate("beneficiaryId", "name shopName phone email")
      .sort({ paymentDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SettlementPayout.countDocuments(query),
  ]);

  return { items, page, limit, total, totalPages: Math.ceil(total / limit) || 1 };
}

function deriveStatus(earned, paid) {
  if (paid <= 0) return "PENDING";
  if (paid >= earned) return "FULLY_PAID";
  return "PARTIALLY_PAID";
}

/**
 * Admin beneficiary table: name, earned, paid, remaining, last payout,
 * derived status, for every seller/delivery partner (paginated + filtered).
 */
export async function listBeneficiaries(beneficiaryType, {
  search = "",
  status = "",
  dateRange = null,
  page = 1,
  limit = 20,
} = {}) {
  assertBeneficiaryType(beneficiaryType);
  const BeneficiaryModel = BENEFICIARY_MODEL[beneficiaryType];
  const nameFields = beneficiaryType === BENEFICIARY_TYPE.SELLER
    ? ["name", "shopName", "phone", "email"]
    : ["name", "phone", "email"];

  const query = {};
  if (search) {
    query.$or = nameFields.map((field) => ({ [field]: { $regex: search, $options: "i" } }));
  }

  const skip = (page - 1) * limit;
  const [candidates, total] = await Promise.all([
    BeneficiaryModel.find(query)
      .select(
        beneficiaryType === BENEFICIARY_TYPE.SELLER
          ? "name shopName phone email bankDetails upiDetails"
          : "name phone email accountHolder accountNumber ifsc upiId",
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    BeneficiaryModel.countDocuments(query),
  ]);

  const rows = await Promise.all(
    candidates.map(async (beneficiary) => {
      const [earned, paid, lastPayout] = await Promise.all([
        getEligibleEarnings(beneficiaryType, beneficiary._id, dateRange),
        getTotalPaid(beneficiaryType, beneficiary._id, dateRange),
        SettlementPayout.findOne({
          beneficiaryId: beneficiary._id,
          beneficiaryType,
          status: SETTLEMENT_PAYOUT_STATUS.PAID,
        })
          .sort({ paymentDate: -1 })
          .lean(),
      ]);

      return {
        beneficiary,
        totalEarned: earned,
        totalPaid: paid,
        remaining: roundCurrency(Math.max(0, earned - paid)),
        lastPayout: lastPayout || null,
        status: deriveStatus(earned, paid),
      };
    }),
  );

  const filteredRows = status ? rows.filter((row) => row.status === status) : rows;

  return { items: filteredRows, page, limit, total, totalPages: Math.ceil(total / limit) || 1 };
}

/** Admin dashboard summary cards for one beneficiary type. */
export async function getAdminDashboardSummary(beneficiaryType) {
  assertBeneficiaryType(beneficiaryType);
  const ownerField = OWNER_FIELD_BY_TYPE[beneficiaryType];
  const statusField = SETTLEMENT_STATUS_FIELD_BY_TYPE[beneficiaryType];
  const earningField = EARNING_FIELD_BY_TYPE[beneficiaryType];

  const [[earningsResult], [paidResult], todayPaid, weekPaid, monthPaid] = await Promise.all([
    Order.aggregate([
      { $match: { [ownerField]: { $ne: null }, [statusField]: { $in: ELIGIBLE_PAYOUT_SUBSTATUSES } } },
      { $group: { _id: null, total: { $sum: `$${earningField}` } } },
    ]),
    SettlementPayout.aggregate([
      { $match: { beneficiaryType, status: SETTLEMENT_PAYOUT_STATUS.PAID } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    getPeriodPaidTotal(beneficiaryType, getSettlementDateRange("today")),
    getPeriodPaidTotal(beneficiaryType, getSettlementDateRange("this_week")),
    getPeriodPaidTotal(beneficiaryType, getSettlementDateRange("this_month")),
  ]);

  const totalEarnings = roundCurrency(earningsResult?.total || 0);
  const totalPaid = roundCurrency(paidResult?.total || 0);

  return {
    totalEarnings,
    totalPaid,
    totalRemaining: roundCurrency(Math.max(0, totalEarnings - totalPaid)),
    todayPayout: todayPaid,
    weeklyPayout: weekPaid,
    monthlyPayout: monthPaid,
  };
}

async function getPeriodPaidTotal(beneficiaryType, dateRange) {
  const [result] = await SettlementPayout.aggregate([
    {
      $match: {
        beneficiaryType,
        status: SETTLEMENT_PAYOUT_STATUS.PAID,
        paymentDate: { $gte: dateRange.start, $lte: dateRange.end },
      },
    },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  return roundCurrency(result?.total || 0);
}
