import mongoose from "mongoose";
import DeliverySurgeRule from "../../models/deliverySurgeRule.js";
import Transaction from "../../models/transaction.js";
import Zone from "../../models/zone.js";
import { roundCurrency } from "../../utils/money.js";
import { parseOptionalDate } from "./deliverySurge.period.js";

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

function normalizeTimeWindows(windows = []) {
  if (!Array.isArray(windows)) return [];
  return windows.map((w) => ({
    daysOfWeek: Array.isArray(w?.daysOfWeek)
      ? w.daysOfWeek.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      : [],
    startTime: String(w?.startTime || "00:00").trim(),
    endTime: String(w?.endTime || "23:59").trim(),
  }));
}

function normalizePayload(body, { isUpdate = false } = {}) {
  const payload = {};

  if (body.name != null) payload.name = String(body.name).trim();
  if (body.description != null) {
    payload.description = String(body.description || "").trim();
  }
  if (body.amount != null) payload.amount = roundCurrency(body.amount);
  if (body.zoneIds != null) {
    const zoneIds = [...new Set((body.zoneIds || []).map(String))]
      .map(toOid)
      .filter(Boolean);
    if (!zoneIds.length && !isUpdate) {
      throw svcErr("At least one zone is required");
    }
    if (zoneIds.length) payload.zoneIds = zoneIds;
  }
  if (body.status != null) payload.status = body.status;
  if (body.priority != null) payload.priority = Number(body.priority) || 0;
  if (body.timeWindows != null) payload.timeWindows = normalizeTimeWindows(body.timeWindows);

  if (body.startAt !== undefined) {
    payload.startAt = parseOptionalDate(body.startAt, { endOfDay: false });
  }
  if (body.endAt !== undefined) {
    payload.endAt = parseOptionalDate(body.endAt, { endOfDay: true });
  }

  if (payload.startAt && payload.endAt && payload.endAt.getTime() <= payload.startAt.getTime()) {
    throw svcErr("End date must be after start date");
  }

  return payload;
}

async function assertZonesExist(zoneIds) {
  if (!zoneIds?.length) return;
  const count = await Zone.countDocuments({ _id: { $in: zoneIds } });
  if (count !== zoneIds.length) {
    throw svcErr("One or more selected zones were not found");
  }
}

export async function listZonesForPicker() {
  const zones = await Zone.find({})
    .select("_id name isActive")
    .sort({ isActive: -1, name: 1 })
    .lean();
  return { items: zones };
}

export async function createRule(body, adminId) {
  const payload = normalizePayload(body);
  if (!payload.name || payload.amount == null || !payload.zoneIds?.length) {
    throw svcErr("Name, amount, and zones are required");
  }
  await assertZonesExist(payload.zoneIds);

  const createdBy = toOid(adminId);
  if (!createdBy) throw svcErr("Admin identity required", 401);

  const rule = await DeliverySurgeRule.create({
    ...payload,
    status: payload.status || "draft",
    createdBy,
  });

  return DeliverySurgeRule.findById(rule._id).populate("zoneIds", "name isActive").lean();
}

export async function updateRule(id, body) {
  const oid = toOid(id);
  if (!oid) throw svcErr("Invalid surge rule id", 400);

  const existing = await DeliverySurgeRule.findById(oid);
  if (!existing) throw svcErr("Surge rule not found", 404);

  const payload = normalizePayload(body, { isUpdate: true });
  if (payload.zoneIds) await assertZonesExist(payload.zoneIds);

  Object.assign(existing, payload);
  await existing.save();

  return DeliverySurgeRule.findById(oid).populate("zoneIds", "name isActive").lean();
}

export async function listRules({ status, zoneId, search, page = 1, limit = 20 } = {}) {
  const query = {};
  if (status && status !== "all") query.status = status;
  if (zoneId) {
    const zid = toOid(zoneId);
    if (zid) query.zoneIds = zid;
  }
  if (search && String(search).trim()) {
    query.name = { $regex: String(search).trim(), $options: "i" };
  }

  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    DeliverySurgeRule.find(query)
      .populate("zoneIds", "name isActive")
      .sort({ priority: -1, updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    DeliverySurgeRule.countDocuments(query),
  ]);

  return { items, total, page, limit };
}

export async function getRuleById(id) {
  const oid = toOid(id);
  if (!oid) throw svcErr("Invalid surge rule id", 400);

  const rule = await DeliverySurgeRule.findById(oid)
    .populate("zoneIds", "name isActive")
    .lean();
  if (!rule) throw svcErr("Surge rule not found", 404);

  const recentCredits = await Transaction.find({
    type: "Surge",
    "meta.surgeRuleId": String(oid),
    status: "Settled",
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .select("amount createdAt meta reference order")
    .lean();

  return { ...rule, recentCredits };
}

export async function setRuleStatus(id, status) {
  const allowed = ["draft", "active", "paused", "ended"];
  if (!allowed.includes(status)) throw svcErr("Invalid status");

  const oid = toOid(id);
  if (!oid) throw svcErr("Invalid surge rule id", 400);

  const rule = await DeliverySurgeRule.findById(oid);
  if (!rule) throw svcErr("Surge rule not found", 404);

  if (status === "active" && (!rule.zoneIds || !rule.zoneIds.length)) {
    throw svcErr("Cannot activate a surge without zones");
  }
  if (status === "active" && !(Number(rule.amount) > 0)) {
    throw svcErr("Cannot activate a surge with invalid amount");
  }

  rule.status = status;
  await rule.save();
  return DeliverySurgeRule.findById(oid).populate("zoneIds", "name isActive").lean();
}

export async function deleteRule(id) {
  const oid = toOid(id);
  if (!oid) throw svcErr("Invalid surge rule id", 400);

  const rule = await DeliverySurgeRule.findById(oid);
  if (!rule) throw svcErr("Surge rule not found", 404);

  const applied = await Transaction.exists({
    type: "Surge",
    "meta.surgeRuleId": String(oid),
  });

  if (applied || rule.timesApplied > 0) {
    rule.status = "ended";
    await rule.save();
    return { deleted: false, ended: true, rule };
  }

  await DeliverySurgeRule.deleteOne({ _id: oid });
  return { deleted: true, ended: false };
}
