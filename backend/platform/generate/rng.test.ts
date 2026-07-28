import { describe, it, expect } from "vitest";
import { mulberry32, pickWeighted, randomInt, randomDateBetween } from "./rng";

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });

  it("produces values in [0, 1)", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("pickWeighted", () => {
  it("only ever returns items with weight > 0 when others are 0", () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 20; i++) {
      const v = pickWeighted(rng, [{ value: "a", weight: 0 }, { value: "b", weight: 1 }]);
      expect(v).toBe("b");
    }
  });
});

describe("randomInt", () => {
  it("stays within [min, max] inclusive", () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 200; i++) {
      const v = randomInt(rng, 5, 8);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(8);
    }
  });
});

describe("randomDateBetween", () => {
  it("stays within the given range", () => {
    const rng = mulberry32(9);
    const start = new Date("2025-01-01");
    const end = new Date("2025-02-01");
    for (let i = 0; i < 50; i++) {
      const d = randomDateBetween(rng, start, end);
      expect(d.getTime()).toBeGreaterThanOrEqual(start.getTime());
      expect(d.getTime()).toBeLessThanOrEqual(end.getTime());
    }
  });
});
