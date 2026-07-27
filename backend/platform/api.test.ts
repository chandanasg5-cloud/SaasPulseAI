import { describe, it, expect } from "vitest";
import { health } from "./api";

describe("health", () => {
  it("returns ok", async () => {
    expect(await health()).toEqual({ status: "ok" });
  });
});
