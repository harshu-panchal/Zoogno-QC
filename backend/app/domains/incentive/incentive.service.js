import mongoose from "mongoose";
import IncentiveCampaign from "../../models/incentiveCampaign.js";
import IncentiveAssignment from "../../models/incentiveAssignment.js";
import IncentiveProgress from "../../models/incentiveProgress.js";
import IncentivePayout from "../../models/incentivePayout.js";
import Delivery from "../../models/delivery.js";
import Zone from "../../models/zone.js";
import { roundCurrency } from "../../utils/money.js";
import {
  clampPeriodToCampaign,
  isWithinCampaignWindow,
  msRemaining,
  parseCampaignDate,
  resolvePeriod,
} from "./incentive.period.js";
import {
  findEligiblePartners,
  isRiderEligibleForCampaign,
} from "./incentive.eligibility.js";
import { notifyRider } from "./incentive.evaluation.js";

function svcErr(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function toOid(id) {
  if (!id) return null;
  const s = String(id);
  if (!mongoose.Types.ObjectId.isValid(s)) return null;
  return new mongoose.Types.ObjectId(s);
}

function normalizeFilters(filters = {}) {
  const zoneIds = Array.isArray(filters.zoneIds)
    ? filters.zoneIds.map(String).filter(Boolean)
    : [];
  return {
    zoneIds,
    verifiedOnly: filters.verifiedOnly !== false,
    minRating: filters.minRating != null ? Number(filters.minRating) : null,
    maxRating: filters.maxRating != null ? Number(filters.maxRating) : null,
    minLifetimeOrders:
      filters.minLifetimeOrders != null ? Number(filters.minLifetimeOrders) : null,
    joiningFrom: filters.joiningFrom ? new Date(filters.joiningFrom) : null,
    joiningTo: filters.joiningTo ? new Date(filters.joiningTo) : null,
    currentlyOnline:
      typeof filters.currentlyOnline === "boolean" ? filters.currentlyOnline : null,
  };
}

function normalizePayload(body, { isUpdate = false } = {}) {
  const startAt = parseCampaignDate(body.startAt, { endOfDay: false });
  const endAt = parseCampaignDate(body.endAt, { endOfDay: true });

  if (!isUpdate || body.startAt) {
    if (!startAt) throw svcErr("Invalid start date");
  }
  if (!isUpdate || body.endAt) {
    if (!endAt) throw svcErr("Invalid end date");
  }
  if (startAt && endAt && endAt.getTime() <= startAt.getTime()) {
    throw svcErr("End date must be after start date");
  }

  const periodType = body.periodType;
  const payload = {};
  if (body.title != null) payload.title = String(body.title).trim();
  if (body.description != null) payload.description = String(body.description || "").trim();
  if (body.amount != null) payload.amount = roundCurrency(body.amount);
  if (body.targetOrders != null) payload.targetOrders = Number(body.targetOrders);
  if (periodType) payload.periodType = periodType;
  if (body.repeatEveryPeriod != null) {
    payload.repeatEveryPeriod = periodType === "custom" ? false : Boolean(body.repeatEveryPeriod);
  } else if (periodType === "custom") {
    payload.repeatEveryPeriod = false;
  }
  if (startAt) payload.startAt = startAt;
  if (endAt) payload.endAt = endAt;
  if (body.audienceType) payload.audienceType = body.audienceType;
  if (body.filters) payload.filters = normalizeFilters(body.filters);
  if (body.conditions) payload.conditions = body.conditions;
  if (body.budgetCap !== undefined) {
    payload.budgetCap = body.budgetCap == null ? null : roundCurrency(body.budgetCap);
  }
  if (body.maxPayoutsPerRider !== undefined) {
    payload.maxPayoutsPerRider =
      body.maxPayoutsPerRider == null ? null : Number(body.maxPayoutsPerRider);
  }
  if (body.status) payload.status = body.status;
  return payload;
}

async function replaceAssignments(campaignId, deliveryIds, adminId) {
  const unique = [...new Set((deliveryIds || []).map(String))].filter((id) =>
    mongoose.Types.ObjectId.isValid(id),
  );
  if (!unique.length) {
    await IncentiveAssignment.deleteMany({ campaignId });
    return { assigned: 0 };
  }

  const existing = await Delivery.find({ _id: { $in: unique } }).select("_id").lean();
  const validIds = existing.map((d) => d._id);
  await IncentiveAssignment.deleteMany({ campaignId });
  if (!validIds.length) return { assigned: 0 };

  await IncentiveAssignment.insertMany(
    validIds.map((deliveryId) => ({
      campaignId,
      deliveryId,
      assignedBy: adminId || null,
      assignedAt: new Date(),
    })),
    { ordered: false },
  );
  return { assigned: validIds.length };
}

async function addAssignments(campaignId, deliveryIds, adminId) {
  const unique = [...new Set((deliveryIds || []).map(String))].filter((id) =>
    mongoose.Types.ObjectId.isValid(id),
  );
  if (!unique.length) return { assigned: 0 };

  const existing = await Delivery.find({ _id: { $in: unique } }).select("_id").lean();
  const docs = existing.map((d) => ({
    campaignId,
    deliveryId: d._id,
    assignedBy: adminId || null,
    assignedAt: new Date(),
  }));
  if (!docs.length) return { assigned: 0 };

  try {
    const inserted = await IncentiveAssignment.insertMany(docs, { ordered: false });
    return { assigned: inserted.length };
  } catch (err) {
    if (err?.code === 11000 || err?.writeErrors) {
      const count = await IncentiveAssignment.countDocuments({ campaignId });
      return { assigned: count };
    }
    throw err;
  }
}

export async function createCampaign(body, adminId) {
  const payload = normalizePayload(body);
  if (payload.audienceType === "specific") {
    const ids = body.deliveryIds || [];
    if (!ids.length) {
      throw svcErr("Select at least one delivery partner for a specific incentive");
    }
  }

  if (payload.status === "active" && payload.endAt < new Date()) {
    throw svcErr("Cannot activate a campaign whose end date is in the past");
  }

  const campaign = await IncentiveCampaign.create({
    ...payload,
    status: payload.status || "draft",
    createdBy: adminId,
  });

  if (payload.audienceType === "specific" && body.deliveryIds?.length) {
    await replaceAssignments(campaign._id, body.deliveryIds, adminId);
  }

  if (campaign.status === "active") {
    notifyEligibleRiders(campaign.toObject ? campaign.toObject() : campaign).catch(() => {});
  }

  return getCampaignById(campaign._id);
}

export async function updateCampaign(id, body, adminId) {
  const campaign = await IncentiveCampaign.findById(id);
  if (!campaign) throw svcErr("Incentive not found", 404);

  const payload = normalizePayload(body, { isUpdate: true });
  const nextAudience = payload.audienceType || campaign.audienceType;

  if (payload.status === "active") {
    const endAt = payload.endAt || campaign.endAt;
    if (new Date(endAt) < new Date()) {
      throw svcErr("Cannot activate a campaign whose end date is in the past");
    }
  }

  if (nextAudience === "specific" && body.deliveryIds) {
    if (!body.deliveryIds.length) {
      throw svcErr("Select at least one delivery partner for a specific incentive");
    }
  }

  const touchedRules =
    payload.amount != null ||
    payload.targetOrders != null ||
    payload.periodType != null ||
    payload.startAt != null ||
    payload.endAt != null;
  if (touchedRules && campaign.status !== "draft") {
    payload.rulesVersion = (campaign.rulesVersion || 1) + 1;
  }

  const previousStatus = campaign.status;
  Object.assign(campaign, payload);
  await campaign.save();

  if (nextAudience === "specific" && body.deliveryIds) {
    await replaceAssignments(campaign._id, body.deliveryIds, adminId);
  }
  if (nextAudience !== "specific") {
    await IncentiveAssignment.deleteMany({ campaignId: campaign._id });
  }

  if (previousStatus !== "active" && campaign.status === "active") {
    notifyEligibleRiders(campaign.toObject()).catch(() => {});
  }

  return getCampaignById(campaign._id);
}

export async function setCampaignStatus(id, status) {
  const campaign = await IncentiveCampaign.findById(id);
  if (!campaign) throw svcErr("Incentive not found", 404);
  const allowed = ["draft", "active", "paused", "ended"];
  if (!allowed.includes(status)) throw svcErr("Invalid status");

  if (status === "active" && new Date(campaign.endAt) < new Date()) {
    throw svcErr("Cannot activate a campaign whose end date is in the past");
  }
  if (status === "active" && campaign.audienceType === "specific") {
    const count = await IncentiveAssignment.countDocuments({ campaignId: campaign._id });
    if (!count) throw svcErr("Assign at least one delivery partner before activating");
  }

  const wasActive = campaign.status !== "active" && status === "active";
  campaign.status = status;
  await campaign.save();

  if (wasActive) {
    notifyEligibleRiders(campaign).catch(() => {});
  }

  return getCampaignById(campaign._id);
}

async function notifyEligibleRiders(campaign) {
  if (campaign.audienceType === "specific") {
    const rows = await IncentiveAssignment.find({ campaignId: campaign._id })
      .select("deliveryId")
      .lean();
    for (const row of rows) {
      await notifyRider({
        deliveryId: row.deliveryId,
        title: "New incentive offer",
        message: `${campaign.title}: complete ${campaign.targetOrders} orders and earn ₹${campaign.amount}.`,
        data: { event: "incentive:updated", campaignId: String(campaign._id) },
      });
    }
    return;
  }

  const result = await findEligiblePartners({
    filters: {
      ...(campaign.filters || {}),
      verifiedOnly: campaign.filters?.verifiedOnly !== false,
    },
    idsOnly: true,
  });
  const ids = (result.items || []).slice(0, 500);
  for (const deliveryId of ids) {
    await notifyRider({
      deliveryId,
      title: "New incentive offer",
      message: `${campaign.title}: complete ${campaign.targetOrders} orders and earn ₹${campaign.amount}.`,
      data: { event: "incentive:updated", campaignId: String(campaign._id) },
    });
  }
}

export async function listCampaigns({ status, page = 1, limit = 20 } = {}) {
  const query = {};
  if (status && status !== "all") query.status = status;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    IncentiveCampaign.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    IncentiveCampaign.countDocuments(query),
  ]);

  const ids = items.map((c) => c._id);
  const [progressAgg, assignmentAgg] = await Promise.all([
    ids.length
      ? IncentiveProgress.aggregate([
          { $match: { campaignId: { $in: ids } } },
          {
            $group: {
              _id: { campaignId: "$campaignId", status: "$status" },
              count: { $sum: 1 },
            },
          },
        ])
      : [],
    ids.length
      ? IncentiveAssignment.aggregate([
          { $match: { campaignId: { $in: ids } } },
          { $group: { _id: "$campaignId", count: { $sum: 1 } } },
        ])
      : [],
  ]);

  const assignedByCampaign = new Map(assignmentAgg.map((r) => [String(r._id), r.count]));
  const progressByCampaign = {};
  for (const row of progressAgg) {
    const key = String(row._id.campaignId);
    progressByCampaign[key] = progressByCampaign[key] || {};
    progressByCampaign[key][row._id.status] = row.count;
  }

  return {
    items: items.map((c) => ({
      ...c,
      assignedCount: assignedByCampaign.get(String(c._id)) || 0,
      progressCounts: progressByCampaign[String(c._id)] || {},
    })),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function getCampaignById(id) {
  const campaign = await IncentiveCampaign.findById(id).lean();
  if (!campaign) throw svcErr("Incentive not found", 404);

  const [assignedCount, progressCounts, payouts] = await Promise.all([
    IncentiveAssignment.countDocuments({ campaignId: campaign._id }),
    IncentiveProgress.aggregate([
      { $match: { campaignId: campaign._id } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    IncentivePayout.aggregate([
      { $match: { campaignId: campaign._id, status: "paid" } },
      { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: "$amount" } } },
    ]),
  ]);

  let assignedPartners = [];
  if (campaign.audienceType === "specific") {
    assignedPartners = await IncentiveAssignment.find({ campaignId: campaign._id })
      .populate("deliveryId", "name phone profileImage isVerified isOnline averageRating")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
  }

  const counts = {};
  for (const row of progressCounts) counts[row._id] = row.count;

  return {
    ...campaign,
    assignedCount,
    progressCounts: counts,
    paidCount: payouts[0]?.count || 0,
    paidAmount: payouts[0]?.amount || 0,
    assignedPartners: assignedPartners.map((a) => a.deliveryId).filter(Boolean),
  };
}

export async function listCampaignProgress(id, { status, page = 1, limit = 25 } = {}) {
  const campaign = await IncentiveCampaign.findById(id).select("_id").lean();
  if (!campaign) throw svcErr("Incentive not found", 404);

  const query = { campaignId: campaign._id };
  if (status && status !== "all") query.status = status;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    IncentiveProgress.find(query)
      .populate("deliveryId", "name phone profileImage isVerified averageRating")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    IncentiveProgress.countDocuments(query),
  ]);

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function assignPartners(id, body, adminId) {
  const campaign = await IncentiveCampaign.findById(id);
  if (!campaign) throw svcErr("Incentive not found", 404);
  if (campaign.audienceType !== "specific") {
    throw svcErr("Partner assignment is only used for specific-audience incentives");
  }

  let deliveryIds = body.deliveryIds || [];
  if (body.selectAllMatching) {
    const result = await findEligiblePartners({
      filters: body.filters || {},
      idsOnly: true,
    });
    deliveryIds = result.items || [];
  }

  const result = body.replace
    ? await replaceAssignments(campaign._id, deliveryIds, adminId)
    : await addAssignments(campaign._id, deliveryIds, adminId);

  return { ...result, campaignId: campaign._id };
}

export async function previewEligiblePartners(filters, pagination) {
  const zones = await Zone.find({ isActive: true }).select("name").lean();
  const result = await findEligiblePartners({
    filters,
    page: pagination.page,
    limit: pagination.limit,
  });
  return {
    ...result,
    filters: {
      zones: zones.map((z) => ({ id: String(z._id), name: z.name })),
    },
  };
}

function serializeOffer(campaign, progress, now) {
  const period = clampPeriodToCampaign(resolvePeriod(campaign, now), campaign);
  const completed = progress?.completedOrders || 0;
  const target = progress?.targetOrders || campaign.targetOrders;
  const remaining = Math.max(0, target - completed);
  const percent = target > 0 ? Math.min(100, Math.round((completed / target) * 100)) : 0;
  const status = progress?.status || "in_progress";
  const periodEnd = progress?.periodEnd || period.periodEnd;

  return {
    campaignId: campaign._id,
    title: campaign.title,
    description: campaign.description || "",
    amount: progress?.amount || campaign.amount,
    targetOrders: target,
    completedOrders: completed,
    remainingOrders: remaining,
    percent,
    periodType: campaign.periodType,
    periodKey: progress?.periodKey || period.periodKey,
    periodStart: progress?.periodStart || period.periodStart,
    periodEnd,
    msRemaining: msRemaining(periodEnd, now),
    status,
    earnedAt: progress?.earnedAt || null,
    paymentStatus: status === "earned" ? "paid" : status === "ineligible" ? "not_paid" : "pending",
  };
}

export async function getMyActiveOffers(deliveryId) {
  const rider = await Delivery.findById(deliveryId).lean();
  if (!rider) throw svcErr("Delivery partner not found", 404);

  const now = new Date();
  const campaigns = await IncentiveCampaign.find({
    status: "active",
    startAt: { $lte: now },
    endAt: { $gte: now },
  }).lean();

  const specificIds = campaigns.filter((c) => c.audienceType === "specific").map((c) => c._id);
  const assignments = specificIds.length
    ? await IncentiveAssignment.find({
        campaignId: { $in: specificIds },
        deliveryId: rider._id,
      })
        .select("campaignId")
        .lean()
    : [];
  const assigned = new Set(assignments.map((a) => String(a.campaignId)));

  const eligible = [];
  for (const campaign of campaigns) {
    if (!isWithinCampaignWindow(campaign, now)) continue;
    const ok = await isRiderEligibleForCampaign(campaign, rider, {
      assignedIds:
        campaign.audienceType === "specific"
          ? assigned.has(String(campaign._id))
            ? new Set([String(rider._id)])
            : new Set()
          : undefined,
    });
    if (ok) eligible.push(campaign);
  }

  const progressRows = eligible.length
    ? await IncentiveProgress.find({
        campaignId: { $in: eligible.map((c) => c._id) },
        deliveryId: rider._id,
      }).lean()
    : [];

  const progressByCampaign = new Map();
  for (const row of progressRows) {
    const key = String(row.campaignId);
    const current = resolvePeriod(
      eligible.find((c) => String(c._id) === key),
      now,
    );
    if (row.periodKey === current.periodKey) {
      progressByCampaign.set(key, row);
    }
  }

  return eligible.map((campaign) =>
    serializeOffer(campaign, progressByCampaign.get(String(campaign._id)), now),
  );
}

export async function getMyIncentiveHistory(deliveryId, { page = 1, limit = 50 } = {}) {
  const skip = (page - 1) * limit;
  const query = { deliveryId: toOid(deliveryId) };
  const [items, total] = await Promise.all([
    IncentiveProgress.find(query)
      .populate("campaignId", "title periodType")
      .sort({ earnedAt: -1, updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    IncentiveProgress.countDocuments(query),
  ]);

  return {
    items: items.map((row) => ({
      _id: row._id,
      title: row.campaignId?.title || "Incentive",
      periodType: row.campaignId?.periodType || "",
      periodKey: row.periodKey,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      targetOrders: row.targetOrders,
      completedOrders: row.completedOrders,
      amount: row.amount,
      status: row.status,
      earnedAt: row.earnedAt,
      paymentStatus: row.status === "earned" ? "paid" : row.status === "ineligible" ? "not_paid" : "pending",
      transactionRef: row.transactionRef || "",
    })),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}
