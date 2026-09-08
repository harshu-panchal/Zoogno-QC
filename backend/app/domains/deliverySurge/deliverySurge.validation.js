import Joi from "joi";

const objectId = Joi.string().hex().length(24);

const timeWindowSchema = Joi.object({
  daysOfWeek: Joi.array().items(Joi.number().integer().min(0).max(6)).default([]),
  startTime: Joi.string()
    .pattern(/^\d{1,2}:\d{2}$/)
    .default("00:00"),
  endTime: Joi.string()
    .pattern(/^\d{1,2}:\d{2}$/)
    .default("23:59"),
});

export const surgeRuleBodySchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  description: Joi.string().trim().max(500).allow("", null).optional(),
  amount: Joi.number().positive().max(1000000).required(),
  zoneIds: Joi.array().items(objectId).min(1).required(),
  status: Joi.string().valid("draft", "active", "paused", "ended").optional(),
  startAt: Joi.alternatives().try(Joi.date(), Joi.string().trim().allow("", null)).optional(),
  endAt: Joi.alternatives().try(Joi.date(), Joi.string().trim().allow("", null)).optional(),
  timeWindows: Joi.array().items(timeWindowSchema).default([]),
  priority: Joi.number().integer().min(0).max(10000).optional(),
});

export const surgeRuleUpdateSchema = surgeRuleBodySchema.fork(
  ["name", "amount", "zoneIds"],
  (s) => s.optional(),
);

export const surgeStatusSchema = Joi.object({
  status: Joi.string().valid("draft", "active", "paused", "ended").required(),
});
