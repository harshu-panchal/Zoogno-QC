import { describe, it, expect } from "@jest/globals";
import {
  isWithinTimeWindows,
  isWithinSchedule,
  parseOptionalDate,
} from "../app/domains/deliverySurge/deliverySurge.period.js";

describe("deliverySurge.period", () => {
  it("treats empty time windows as always open", () => {
    expect(isWithinTimeWindows([], new Date("2026-03-15T10:00:00.000Z"))).toBe(true);
  });

  it("matches overnight windows", () => {
    // 22:00–06:00 IST. 2026-03-15 17:30 UTC = 23:00 IST
    const lateNight = new Date("2026-03-15T17:30:00.000Z");
    expect(
      isWithinTimeWindows(
        [{ daysOfWeek: [], startTime: "22:00", endTime: "06:00" }],
        lateNight,
      ),
    ).toBe(true);

    // 2026-03-15 05:30 UTC = 11:00 IST — outside overnight window
    const midday = new Date("2026-03-15T05:30:00.000Z");
    expect(
      isWithinTimeWindows(
        [{ daysOfWeek: [], startTime: "22:00", endTime: "06:00" }],
        midday,
      ),
    ).toBe(false);
  });

  it("respects schedule start/end", () => {
    const rule = {
      startAt: new Date("2026-03-01T00:00:00.000Z"),
      endAt: new Date("2026-03-31T23:59:59.000Z"),
      timeWindows: [],
    };
    expect(isWithinSchedule(rule, new Date("2026-03-15T12:00:00.000Z"))).toBe(true);
    expect(isWithinSchedule(rule, new Date("2026-04-02T12:00:00.000Z"))).toBe(false);
  });

  it("parses YYYY-MM-DD as IST day bounds", () => {
    const start = parseOptionalDate("2026-03-15", { endOfDay: false });
    const end = parseOptionalDate("2026-03-15", { endOfDay: true });
    expect(start).toBeInstanceOf(Date);
    expect(end).toBeInstanceOf(Date);
    expect(end.getTime()).toBeGreaterThan(start.getTime());
  });
});
