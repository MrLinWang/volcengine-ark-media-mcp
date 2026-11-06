import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ArkApiError } from "../src/errors.js";

describe("Ark API error messages", () => {
  it("maps UnsupportedModel to a plan hint", () => {
    const error = new ArkApiError("The requested model does not support the agent plan feature.", {
      code: "UnsupportedModel",
      status: 404,
    });
    assert.match(error.userMessage(), /Large 或 Max/);
    assert.match(error.userMessage(), /Medium/);
  });

  it("maps authentication errors to the Agent Plan key hint", () => {
    const error = new ArkApiError("unauthorized", { status: 401, code: "Unauthorized" });
    assert.match(error.userMessage(), /Agent Plan 专属 API Key/);
  });
});
