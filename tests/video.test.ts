import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateVideoInput } from "../src/video.js";

describe("video input validation", () => {
  it("requires at least one content input", () => {
    assert.throws(
      () => validateVideoInput({}, "doubao-seedance-2.0"),
      /至少需要/,
    );
  });

  it("requires first frame when last frame is given", () => {
    assert.throws(
      () =>
        validateVideoInput(
          { lastFrame: "https://example.com/a.png" },
          "doubao-seedance-2.0",
        ),
      /first_frame/,
    );
  });

  it("rejects mixing first/last frame with references", () => {
    assert.throws(
      () =>
        validateVideoInput(
          {
            firstFrame: "https://example.com/a.png",
            referenceImages: ["https://example.com/b.png"],
          },
          "doubao-seedance-2.0",
        ),
      /互斥/,
    );
  });

  it("rejects standalone audio on Seedance 2.0", () => {
    assert.throws(
      () =>
        validateVideoInput(
          { referenceAudios: ["https://example.com/a.mp3"] },
          "doubao-seedance-2.0",
        ),
      /Seedance 2\.5/,
    );
  });

  it("accepts standalone audio on Seedance 2.5", () => {
    assert.doesNotThrow(() =>
      validateVideoInput(
        { referenceAudios: ["https://example.com/a.mp3"] },
        "doubao-seedance-2.5",
      ),
    );
  });
});
