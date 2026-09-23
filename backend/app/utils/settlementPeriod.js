/**
 * Date-range helpers for settlement/payout calculations.
 * All calendar math is done in Asia/Kolkata (IST, UTC+05:30) using a fixed
 * offset (India has no DST), mirroring domains/incentive/incentive.period.js
 * so "today"/"this week"/"this month" mean the same thing everywhere in the
 * finance layer regardless of server timezone.
 */

export const SETTLEMENT_TIMEZONE = "Asia/Kolkata";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function getIstParts(date = new Date()) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth() + 1,
    day: ist.getUTCDate(),
    weekday: ist.getUTCDay(),
  };
}

function startOfIstDay(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MS);
}

function startOfNextIstDay(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day + 1) - IST_OFFSET_MS);
}

function endOfIstDay(year, month, day) {
  return new Date(startOfNextIstDay(year, month, day).getTime() - 1);
}

function mondayIstParts(year, month, day, weekday) {
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
  const mondayUtc = Date.UTC(year, month - 1, day) - daysFromMonday * DAY_MS;
  const m = new Date(mondayUtc);
  return { year: m.getUTCFullYear(), month: m.getUTCMonth() + 1, day: m.getUTCDate() };
}

function parseDateInput(value, { endOfDay = false } = {}) {
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

/**
 * Returns { start, end } (both Date, inclusive) for a named period, or null
 * for "overall"/unrecognized periods (meaning: no date filter at all).
 */
export function getSettlementDateRange(period, customStart, customEnd) {
  const now = new Date();
  const parts = getIstParts(now);

  if (period === "today") {
    return {
      start: startOfIstDay(parts.year, parts.month, parts.day),
      end: endOfIstDay(parts.year, parts.month, parts.day),
    };
  }

  if (period === "this_week") {
    const monday = mondayIstParts(parts.year, parts.month, parts.day, parts.weekday);
    const start = startOfIstDay(monday.year, monday.month, monday.day);
    const end = new Date(start.getTime() + 7 * DAY_MS - 1);
    return { start, end };
  }

  if (period === "this_month") {
    const start = startOfIstDay(parts.year, parts.month, 1);
    const nextMonthStart = startOfIstDay(parts.year, parts.month + 1, 1);
    return { start, end: new Date(nextMonthStart.getTime() - 1) };
  }

  if (period === "custom") {
    const start = parseDateInput(customStart);
    const end = parseDateInput(customEnd, { endOfDay: true });
    if (!start && !end) return null;
    return { start: start || new Date(0), end: end || new Date() };
  }

  return null;
}
