import test from "node:test";
import assert from "node:assert/strict";
import { computeKpiDeltas } from "./kpiDeltas.ts";

test("computes month-over-month percent deltas from the last two points", () => {
  const d = computeKpiDeltas(
    [{ month: "Apr", mrr: 100 }, { month: "May", mrr: 110 }],
    [{ month: "Apr", active_customers: 200 }, { month: "May", active_customers: 190 }],
  );
  assert.equal(d.mrrPct.toFixed(1), "10.0");
  assert.equal(d.arrPct, d.mrrPct);
  assert.equal(d.customersPct.toFixed(1), "-5.0");
});

test("uses the LAST two points of longer series", () => {
  const d = computeKpiDeltas(
    [{ month: "Mar", mrr: 1 }, { month: "Apr", mrr: 200 }, { month: "May", mrr: 150 }],
    [],
  );
  assert.equal(d.mrrPct.toFixed(1), "-25.0");
  assert.equal(d.customersPct, null);
});

test("returns null with fewer than 2 points", () => {
  const d = computeKpiDeltas([{ month: "May", mrr: 100 }], []);
  assert.equal(d.mrrPct, null);
  assert.equal(d.arrPct, null);
  assert.equal(d.customersPct, null);
});

test("returns null when the prior value is 0 (no divide-by-zero)", () => {
  const d = computeKpiDeltas(
    [{ month: "Apr", mrr: 0 }, { month: "May", mrr: 50 }],
    [{ month: "Apr", active_customers: 0 }, { month: "May", active_customers: 5 }],
  );
  assert.equal(d.mrrPct, null);
  assert.equal(d.customersPct, null);
});
