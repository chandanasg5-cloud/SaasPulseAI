import { describe, it, expect } from "vitest";
import { filterCardsByCompanyName } from "./filterCardsByCompanyName";

const cards = [
  { company_name: "Acme Corp", other: 1 },
  { company_name: "Globex", other: 2 },
  { company_name: "acme labs", other: 3 },
];

describe("filterCardsByCompanyName", () => {
  it("matches case-insensitively on substring", () => {
    const result = filterCardsByCompanyName(cards, "ACME");
    expect(result.map((c) => c.company_name)).toEqual(["Acme Corp", "acme labs"]);
  });

  it("returns all cards for undefined, empty, and whitespace-only queries", () => {
    expect(filterCardsByCompanyName(cards, undefined)).toEqual(cards);
    expect(filterCardsByCompanyName(cards, "")).toEqual(cards);
    expect(filterCardsByCompanyName(cards, "   ")).toEqual(cards);
  });

  it("trims surrounding whitespace from the query", () => {
    const result = filterCardsByCompanyName(cards, "  globex  ");
    expect(result.map((c) => c.company_name)).toEqual(["Globex"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterCardsByCompanyName(cards, "zzz")).toEqual([]);
  });

  it("preserves the extra properties of matched cards", () => {
    const result = filterCardsByCompanyName(cards, "globex");
    expect(result).toEqual([{ company_name: "Globex", other: 2 }]);
  });
});
