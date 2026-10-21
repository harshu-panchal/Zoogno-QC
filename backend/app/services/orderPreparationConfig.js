import Setting from "../models/setting.js";
import logger from "./logger.js";

export const PREP_CONFIG_DEFAULTS = Object.freeze({
  enabled: true,
  defaultPrepMinutes: 10,
  maxPrepMinutes: 20,
  broadcastLeadMinutes: 5,
  rebroadcastIntervalSeconds: 300,
});

function toPositiveInt(value, fallback, { min = 0 } = {}) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < min) return fallback;
  return n;
}

/**
 * Reads the admin-configured order preparation / dispatch timing, falling back to
 * sane defaults when settings are missing or the DB read fails. Never throws.
 */
export async function getOrderPreparationConfig() {
  try {
    const s = await Setting.findOne({}).select("orderPreparationConfig").lean();
    const raw = s?.orderPreparationConfig || {};
    const maxPrepMinutes = toPositiveInt(
      raw.maxPrepMinutes,
      PREP_CONFIG_DEFAULTS.maxPrepMinutes,
      { min: 1 },
    );
    let defaultPrepMinutes = toPositiveInt(
      raw.defaultPrepMinutes,
      PREP_CONFIG_DEFAULTS.defaultPrepMinutes,
      { min: 1 },
    );
    // Default can never exceed the ceiling.
    if (defaultPrepMinutes > maxPrepMinutes) defaultPrepMinutes = maxPrepMinutes;

    return {
      enabled: raw.enabled !== false,
      defaultPrepMinutes,
      maxPrepMinutes,
      broadcastLeadMinutes: toPositiveInt(
        raw.broadcastLeadMinutes,
        PREP_CONFIG_DEFAULTS.broadcastLeadMinutes,
        { min: 0 },
      ),
      rebroadcastIntervalSeconds: toPositiveInt(
        raw.rebroadcastIntervalSeconds,
        PREP_CONFIG_DEFAULTS.rebroadcastIntervalSeconds,
        { min: 30 },
      ),
    };
  } catch (err) {
    logger.warn("getOrderPreparationConfig: falling back to defaults", {
      scope: "orderPreparationConfig",
      error: err.message,
    });
    return { ...PREP_CONFIG_DEFAULTS };
  }
}

/**
 * Resolves the prep minutes a seller is allowed to commit.
 * Throws a 400 when the requested time exceeds the admin ceiling.
 * When no value is supplied (or auto-accept), returns the configured default.
 */
export function resolvePreparationMinutes(requested, config, { isAuto = false } = {}) {
  const max = config.maxPrepMinutes;
  const fallback = Math.min(config.defaultPrepMinutes, max);

  if (requested == null || requested === "") {
    return fallback;
  }

  const minutes = Math.round(Number(requested));
  if (!Number.isFinite(minutes) || minutes < 1) {
    if (isAuto) return fallback;
    const err = new Error("Preparation time must be a positive number of minutes");
    err.statusCode = 400;
    throw err;
  }

  if (minutes > max) {
    if (isAuto) return max;
    const err = new Error(
      `Preparation time cannot exceed the ${max} minute limit set by admin`,
    );
    err.statusCode = 400;
    throw err;
  }

  return minutes;
}
