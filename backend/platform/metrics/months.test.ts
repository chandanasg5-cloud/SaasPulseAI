import { describe, it, expect } from "vitest";
import { monthKey, startOfMonth, endOfMonth, trailingMonths, parseLocalDate } from "./months";

describe("monthKey", () => {
  it("formats as YYYY-MM", () => {
    expect(monthKey(new Date(2026, 6, 15))).toBe("2026-07");
    expect(monthKey(new Date(2026, 0, 1))).toBe("2026-01");
  });
});

describe("startOfMonth / endOfMonth", () => {
  it("returns the first and last instant of the month", () => {
    const start = startOfMonth(new Date(2026, 6, 15));
    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(6);

    const end = endOfMonth(new Date(2026, 6, 15));
    expect(end.getMonth()).toBe(6);
    expect(end.getDate()).toBe(31);
  });

  it("handles month-length differences (30-day, 31-day, Feb 28/29)", () => {
    // February (non-leap year)
    const febEnd = endOfMonth(new Date(2025, 1, 15));
    expect(febEnd.getDate()).toBe(28);
    expect(febEnd.getMonth()).toBe(1);

    // February (leap year)
    const febLeapEnd = endOfMonth(new Date(2024, 1, 15));
    expect(febLeapEnd.getDate()).toBe(29);
    expect(febLeapEnd.getMonth()).toBe(1);

    // April (30 days)
    const aprEnd = endOfMonth(new Date(2026, 3, 15));
    expect(aprEnd.getDate()).toBe(30);
    expect(aprEnd.getMonth()).toBe(3);
  });
});

describe("trailingMonths", () => {
  it("returns count months, oldest first, ending at now's month", () => {
    const months = trailingMonths(new Date(2026, 6, 27), 3);
    expect(months).toHaveLength(3);
    expect(monthKey(months[0])).toBe("2026-05");
    expect(monthKey(months[1])).toBe("2026-06");
    expect(monthKey(months[2])).toBe("2026-07");
  });
});

describe("parseLocalDate", () => {
  it("parses a bare YYYY-MM-DD string as a local calendar date, regardless of runtime timezone", () => {
    const parsed = parseLocalDate("2026-07-05");
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(6);
    expect(parsed.getDate()).toBe(5);
    expect(parsed.getHours()).toBe(0);
    expect(parsed.getMinutes()).toBe(0);
    expect(parsed.getSeconds()).toBe(0);
  });

  it("lines up with local-time month boundaries built by startOfMonth/endOfMonth", () => {
    const parsed = parseLocalDate("2026-07-31");
    const monthEnd = endOfMonth(new Date(2026, 6, 1));
    // A date-only string for the last day of the month must fall within the
    // local-time end-of-month boundary, not after it (which would happen if
    // it were parsed as UTC midnight in a timezone west of UTC).
    expect(parsed.getTime()).toBeLessThanOrEqual(monthEnd.getTime());
    expect(parsed.getMonth()).toBe(monthEnd.getMonth());
  });

  it("differs from the UTC-parsed form whenever the runtime timezone is not UTC", () => {
    const localParsed = parseLocalDate("2026-07-05");
    const utcParsed = new Date("2026-07-05");
    const offsetMinutes = new Date().getTimezoneOffset();
    if (offsetMinutes === 0) {
      // Running in a UTC timezone: the two forms coincide, which is expected.
      expect(localParsed.getTime()).toBe(utcParsed.getTime());
    } else {
      expect(localParsed.getTime()).not.toBe(utcParsed.getTime());
    }
  });
});
