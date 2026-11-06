import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readInputBytes } from "../src/media.js";

describe("media input", () => {
  it("decodes a base64 data URI", async () => {
    const input = await readInputBytes("data:audio/wav;base64,aGVsbG8=");
    assert.equal(input.buffer.toString("utf8"), "hello");
    assert.equal(input.mime, "audio/wav");
  });

  it("rejects an invalid data URI", async () => {
    await assert.rejects(readInputBytes("data:audio/wav;base64"));
  });
});
