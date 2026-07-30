import { describe, it, expect } from "vitest";
import { computeSupportScore } from "./supportScore";
import type { SupportTicketRow } from "./types";

describe("computeSupportScore", () => {
  const now = new Date(2026, 6, 30);

  it("starts at 25 and subtracts a severity-weighted penalty per ticket in the trailing 90 days", () => {
    const tickets: SupportTicketRow[] = [
      { company_id: "CMP-001", priority: "low", created_at: new Date(2026, 6, 1) },    // -1
      { company_id: "CMP-001", priority: "high", created_at: new Date(2026, 5, 15) },  // -3
      { company_id: "CMP-001", priority: "urgent", created_at: new Date(2026, 6, 20) }, // -5
    ];
    // 25 - (1 + 3 + 5) = 16
    expect(computeSupportScore(tickets, now)).toBe(16);
  });

  it("excludes tickets older than 90 days", () => {
    const tickets: SupportTicketRow[] = [
      { company_id: "CMP-001", priority: "urgent", created_at: new Date(2026, 0, 1) }, // ~180 days before now
    ];
    expect(computeSupportScore(tickets, now)).toBe(25);
  });

  it("floors at 0 rather than going negative", () => {
    const tickets: SupportTicketRow[] = Array.from({ length: 10 }, (_, i) => ({
      company_id: "CMP-001",
      priority: "urgent" as const,
      created_at: new Date(2026, 6, 1 + i),
    }));
    // 10 urgent tickets * 5 = 50 penalty, would go to -25 without the floor
    expect(computeSupportScore(tickets, now)).toBe(0);
  });

  it("returns 25 for a company with no tickets", () => {
    expect(computeSupportScore([], now)).toBe(25);
  });
});
