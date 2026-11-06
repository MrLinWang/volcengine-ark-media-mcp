import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePlanTier } from "../src/config.js";

describe("plan tier config", () => {
  it("defaults to unknown", () => {
    assert.equal(parsePlanTier(undefined), "unknown");
    assert.equal(parsePlanTier(""), "unknown");
  });

  it("accepts the four official tiers", () => {
    for (const tier of ["small", "medium", "large", "max"] as const) {
      assert.equal(parsePlanTier(tier), tier);
      assert.equal(parsePlanTier(tier.toUpperCase()), tier);
    }
  });

  it("rejects an unknown tier", () => {
    assert.throws(() => parsePlanTier("pro"), /ARK_PLAN_TIER/);
  });
});
