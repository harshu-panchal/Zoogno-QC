const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Return { dayOfWeek, totalMinutes } for a Date in Asia/Kolkata. */
export function getIstParts(date = new Date()) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    dayOfWeek: ist.getUTCDay(),
    totalMinutes: ist.getUTCHours() * 60 + ist.getUTCMinutes(),
  };
}

function parseHhMm(value, fallbackMinutes) {
  const raw = String(value || "").trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!m) return fallbackMinutes;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return fallbackMinutes;
  }
  return h * 60 + min;
}

/**
 * Empty timeWindows = always in window (while status/schedule allow).
 * Overnight windows (e.g. 22:00–06:00) are supported.
 */
export function isWithinTimeWindows(timeWindows = [], date = new Date()) {
  if (!Array.isArray(timeWindows) || timeWindows.length === 0) return true;
  const { dayOfWeek, totalMinutes } = getIstParts(date);

  return timeWindows.some((w) => {
    const days = Array.isArray(w?.daysOfWeek) ? w.daysOfWeek : [];
    if (days.length && !days.includes(dayOfWeek)) return false;

    const start = parseHhMm(w?.startTime, 0);
    const end = parseHhMm(w?.endTime, 23 * 60 + 59);

    if (start === end) return true;
    if (start < end) {
      return totalMinutes >= start && totalMinutes <= end;
    }
    return totalMinutes >= start || totalMinutes <= end;
  });
}

export function isWithinSchedule(rule, date = new Date()) {
  const now = date instanceof Date ? date : new Date(date);
  if (rule?.startAt) {
    const start = new Date(rule.startAt);
    if (!Number.isNaN(start.getTime()) && now < start) return false;
  }
  if (rule?.endAt) {
    const end = new Date(rule.endAt);
    if (!Number.isNaN(end.getTime()) && now > end) return false;
  }
  return isWithinTimeWindows(rule?.timeWindows, now);
}

/** Parse date or YYYY-MM-DD as Asia/Kolkata day start/end. */
export function parseOptionalDate(value, { endOfDay = false } = {}) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const s = String(value).trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    const istAsUtc = Date.UTC(
      y,
      m - 1,
      d,
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
    );
    return new Date(istAsUtc - IST_OFFSET_MS);
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
