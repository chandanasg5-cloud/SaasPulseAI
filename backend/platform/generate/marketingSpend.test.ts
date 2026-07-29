import { describe, it, expect } from "vitest";
import { generateMarketingSpend } from "./marketingSpend";

describe("generateMarketingSpend", () => {
  it("generates one row per input month, in order", () => {
    const rows = generateMarketingSpend(
      [
        { month: "2026-01-01", count: 10 },
        { month: "2026-02-01", count: 20 },
      ],
      1,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].month).toBe("2026-01-01");
    expect(rows[1].month).toBe("2026-02-01");
  });

  it("scales spend with new-customer count, staying in a plausible CAC band", () => {
    const rows = generateMarketingSpend(
      [
        { month: "2026-01-01", count: 10 },
        { month: "2026-02-01", count: 100 },
      ],
      2,
    );
    const impliedCac = (row: { amount: number }, count: number) => row.amount / count;
    expect(impliedCac(rows[0], 10)).toBeGreaterThanOrEqual(150);
    expect(impliedCac(rows[0], 10)).toBeLessThanOrEqual(400);
    expect(impliedCac(rows[1], 100)).toBeGreaterThanOrEqual(150);
    expect(impliedCac(rows[1], 100)).toBeLessThanOrEqual(400);
  });

  it("returns zero spend for a zero-count month", () => {
    const rows = generateMarketingSpend([{ month: "2026-01-01", count: 0 }], 3);
    expect(rows[0].amount).toBe(0);
  });

  it("produces unique, sequential ids", () => {
    const rows = generateMarketingSpend(
      [
        { month: "2026-01-01", count: 5 },
        { month: "2026-02-01", count: 5 },
        { month: "2026-03-01", count: 5 },
      ],
      4,
    );
    expect(new Set(rows.map((r) => r.id)).size).toBe(3);
  });
});
