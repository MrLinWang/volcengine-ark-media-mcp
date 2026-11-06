import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../src/config.js";
import { ArkApiError } from "../src/errors.js";
import { generateImage } from "../src/image.js";
import { synthesizeSpeech } from "../src/tts.js";
import { transcribeAudio } from "../src/asr.js";
import { createVideoTask } from "../src/video.js";

async function main(): Promise<void> {
  if (process.env.RUN_LIVE !== "1") {
    console.log("set RUN_LIVE=1 to run live Agent Plan API calls");
    return;
  }

  const config = loadConfig();
  if (!config.apiKey) {
    throw new Error("ARC_AGENT_PLAN_KEY is not set");
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ark-media-live-"));
  const ttsPath = path.join(tempDir, "tts-test.wav");

  console.log("[1/4] image: doubao-seedream-5-0-pro 1K");
  const image = await generateImage(config, {
    prompt: "一只橘猫坐在窗台上，午后阳光，写实摄影",
    size: "1K",
    outputFormat: "png",
    watermark: true,
  });
  console.log(
    `  ok: ${image.images.length} image(s), ${image.images[0]?.size ?? "unknown size"}, ${image.images[0]?.url?.slice(0, 80) ?? "no url"}...`,
  );

  console.log("[2/4] tts: doubao-seed-tts-2.0 wav 16k");
  const tts = await synthesizeSpeech(config, {
    text: "你好，这是火山方舟语音合成测试。",
    format: "wav",
    sampleRate: 16000,
    outputPath: ttsPath,
  });
  console.log(`  ok: ${tts.filePath} (${tts.bytes} bytes)`);

  console.log("[3/4] asr: doubao-seed-asr-2.0 nostream");
  const asr = await transcribeAudio(config, {
    audio: tts.filePath,
    mode: "nostream",
  });
  console.log(`  ok: ${JSON.stringify(asr.text)} (${asr.utterances.length} utterance(s))`);

  console.log("[4/4] video: expect UnsupportedModel on Agent Plan Medium");
  try {
    await createVideoTask(config, {
      prompt: "一只猫在窗台上打哈欠",
      resolution: "480p",
      duration: 4,
      watermark: true,
    });
    console.log("  unexpected: video task was created (is this a Large/Max plan?)");
  } catch (error) {
    if (error instanceof ArkApiError && error.code === "UnsupportedModel") {
      console.log("  ok: UnsupportedModel mapped to plan hint");
    } else {
      throw error;
    }
  }

  await fs.rm(tempDir, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
