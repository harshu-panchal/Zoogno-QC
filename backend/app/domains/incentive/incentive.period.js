/**
 * Incentive period helpers. All calendar math is in Asia/Kolkata (IST, UTC+05:30).
 * Using a fixed offset (no DST in India) keeps period keys stable across servers.
 */

export const INCENTIVE_TIMEZONE = "Asia/Kolkata";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function getIstParts(date = new Date()) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth() + 1,
    day: ist.getUTCDate(),
    weekday: ist.getUTCDay(),
  };
}

export function startOfIstDay(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MS);
}

export function startOfNextIstDay(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day + 1) - IST_OFFSET_MS);
}

export function endOfIstDay(year, month, day) {
  return new Date(startOfNextIstDay(year, month, day).getTime() - 1);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isoWeekFromIst(year, month, day) {
  const utc = Date.UTC(year, month - 1, day);
  const d = new Date(utc);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const isoYear = d.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7);
  return { isoYear, week };
}

function mondayIstParts(year, month, day, weekday) {
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
  const mondayUtc = Date.UTC(year, month - 1, day) - daysFromMonday * DAY_MS;
  const m = new Date(mondayUtc);
  return {
    year: m.getUTCFullYear(),
    month: m.getUTCMonth() + 1,
    day: m.getUTCDate(),
  };
}

/**
 * Parse admin date input. Date-only `YYYY-MM-DD` is interpreted as IST.
 */
export function parseCampaignDate(value, { endOfDay = false } = {}) {
  if (!value) return null;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number);
    return endOfDay ? endOfIstDay(y, m, d) : startOfIstDay(y, m, d);
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function formatIstDate(date) {
  const { year, month, day } = getIstParts(date);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Current period for a campaign at `now`.
 * Non-repeating and custom campaigns use a single `campaign` period spanning start/end.
 */
export function resolvePeriod(campaign, now = new Date()) {
  const startAt = new Date(campaign.startAt);
  const endAt = new Date(campaign.endAt);
  const periodType = campaign.periodType;
  const repeat = campaign.repeatEveryPeriod !== false && periodType !== "custom";

  if (!repeat || periodType === "custom") {
    return {
      periodKey: "campaign",
      periodStart: startAt,
      periodEnd: endAt,
    };
  }

  const parts = getIstParts(now);

  if (periodType === "daily") {
    return {
      periodKey: `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`,
      periodStart: startOfIstDay(parts.year, parts.month, parts.day),
      periodEnd: endOfIstDay(parts.year, parts.month, parts.day),
    };
  }

  if (periodType === "weekly") {
    const monday = mondayIstParts(parts.year, parts.month, parts.day, parts.weekday);
    const { isoYear, week } = isoWeekFromIst(monday.year, monday.month, monday.day);
    const weekStart = startOfIstDay(monday.year, monday.month, monday.day);
    const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS - 1);
    return {
      periodKey: `${isoYear}-W${pad2(week)}`,
      periodStart: weekStart,
      periodEnd: weekEnd,
    };
  }

  if (periodType === "monthly") {
    const monthStart = startOfIstDay(parts.year, parts.month, 1);
    const nextMonthStart = startOfIstDay(parts.year, parts.month + 1, 1);
    return {
      periodKey: `${parts.year}-${pad2(parts.month)}`,
      periodStart: monthStart,
      periodEnd: new Date(nextMonthStart.getTime() - 1),
    };
  }

  return {
    periodKey: "campaign",
    periodStart: startAt,
    periodEnd: endAt,
  };
}

export function clampPeriodToCampaign(period, campaign) {
  const startAt = new Date(campaign.startAt);
  const endAt = new Date(campaign.endAt);
  const periodStart = new Date(Math.max(period.periodStart.getTime(), startAt.getTime()));
  const periodEnd = new Date(Math.min(period.periodEnd.getTime(), endAt.getTime()));
  return { ...period, periodStart, periodEnd };
}

export function isWithinCampaignWindow(campaign, now = new Date()) {
  const t = now.getTime();
  return t >= new Date(campaign.startAt).getTime() && t <= new Date(campaign.endAt).getTime();
}

export function msRemaining(periodEnd, now = new Date()) {
  return Math.max(0, new Date(periodEnd).getTime() - now.getTime());
}
