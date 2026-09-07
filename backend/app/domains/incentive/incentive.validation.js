import Joi from "joi";

const objectId = Joi.string().hex().length(24);

const filtersSchema = Joi.object({
  zoneIds: Joi.array().items(objectId).default([]),
  verifiedOnly: Joi.boolean().default(true),
  minRating: Joi.number().min(0).max(5).allow(null).optional(),
  maxRating: Joi.number().min(0).max(5).allow(null).optional(),
  minLifetimeOrders: Joi.number().integer().min(0).allow(null).optional(),
  joiningFrom: Joi.date().allow(null, "").optional(),
  joiningTo: Joi.date().allow(null, "").optional(),
  currentlyOnline: Joi.boolean().allow(null).optional(),
});

const conditionsSchema = Joi.object({
  countOnlyDelivered: Joi.boolean().default(true),
  requireVerifiedAtPayout: Joi.boolean().default(true),
  excludeReturns: Joi.boolean().default(false),
});

export const campaignBodySchema = Joi.object({
  title: Joi.string().trim().min(2).max(120).required(),
  description: Joi.string().trim().max(500).allow("", null).optional(),
  amount: Joi.number().positive().max(1000000).required(),
  targetOrders: Joi.number().integer().min(1).max(100000).required(),
  periodType: Joi.string().valid("daily", "weekly", "monthly", "custom").required(),
  repeatEveryPeriod: Joi.boolean().default(true),
  startAt: Joi.alternatives().try(Joi.date(), Joi.string().trim()).required(),
  endAt: Joi.alternatives().try(Joi.date(), Joi.string().trim()).required(),
  status: Joi.string().valid("draft", "active", "paused", "ended").optional(),
  audienceType: Joi.string().valid("all", "filtered", "specific").required(),
  filters: filtersSchema.optional(),
  conditions: conditionsSchema.optional(),
  budgetCap: Joi.number().min(0).allow(null).optional(),
  maxPayoutsPerRider: Joi.number().integer().min(1).allow(null).optional(),
  deliveryIds: Joi.array().items(objectId).max(2000).optional(),
});

export const campaignUpdateSchema = campaignBodySchema.fork(
  ["title", "amount", "targetOrders", "periodType", "startAt", "endAt", "audienceType"],
  (s) => s.optional(),
);

export const assignPartnersSchema = Joi.object({
  deliveryIds: Joi.array().items(objectId).max(2000).default([]),
  selectAllMatching: Joi.boolean().default(false),
  filters: Joi.object({
    search: Joi.string().trim().allow("").optional(),
    zoneIds: Joi.array().items(objectId).optional(),
    zone: Joi.string().trim().optional(),
    verified: Joi.alternatives().try(Joi.boolean(), Joi.string()).optional(),
    verifiedOnly: Joi.boolean().optional(),
    status: Joi.string().valid("online", "offline", "all").optional(),
    currentlyOnline: Joi.boolean().optional(),
    minRating: Joi.number().min(0).max(5).optional(),
    maxRating: Joi.number().min(0).max(5).optional(),
    minLifetimeOrders: Joi.number().integer().min(0).optional(),
    joiningFrom: Joi.alternatives().try(Joi.date(), Joi.string()).optional(),
    joiningTo: Joi.alternatives().try(Joi.date(), Joi.string()).optional(),
  }).optional(),
  replace: Joi.boolean().default(false),
});

export const eligiblePartnersQuerySchema = Joi.object({
  search: Joi.string().trim().allow("").optional(),
  zoneIds: Joi.alternatives().try(Joi.array().items(objectId), objectId).optional(),
  zone: Joi.string().trim().optional(),
  verified: Joi.alternatives().try(Joi.boolean(), Joi.string()).optional(),
  verifiedOnly: Joi.boolean().optional(),
  status: Joi.string().valid("online", "offline", "all").optional(),
  currentlyOnline: Joi.boolean().optional(),
  minRating: Joi.number().min(0).max(5).optional(),
  maxRating: Joi.number().min(0).max(5).optional(),
  minLifetimeOrders: Joi.number().integer().min(0).optional(),
  joiningFrom: Joi.alternatives().try(Joi.date(), Joi.string()).optional(),
  joiningTo: Joi.alternatives().try(Joi.date(), Joi.string()).optional(),
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(200).optional(),
});
