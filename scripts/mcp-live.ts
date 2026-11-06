import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function cleanEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  return env;
}

async function main(): Promise<void> {
  if (!process.env.ARC_AGENT_PLAN_KEY) {
    throw new Error("ARC_AGENT_PLAN_KEY is not set; run with --env-file=.env");
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ark-mcp-live-"));
  const ttsPath = path.join(tempDir, "mcp-tts.wav");

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(root, "dist", "index.js")],
    cwd: root,
    env: cleanEnv(),
    stderr: "pipe",
  });
  const client = new Client({ name: "volcengine-ark-media-mcp-live", version: "1.0.0" });
  await client.connect(transport);

  try {
    const tts = await client.callTool({
      name: "ark_text_to_speech",
      arguments: {
        text: "你好，这是通过 MCP 调用的语音合成测试。",
        format: "wav",
        sample_rate: 16000,
        output_path: ttsPath,
      },
    });
    const audio = tts.content.find((item) => item.type === "audio");
    if (!audio || audio.type !== "audio") {
      throw new Error("ark_text_to_speech did not return audio content");
    }
    console.log(
      `tts ok: ${(tts.structuredContent as { file_path?: string })?.file_path ?? ttsPath}, audio ${Math.round(audio.data.length / 1024)} KB base64`,
    );

    const asr = await client.callTool({
      name: "ark_speech_to_text",
      arguments: {
        audio: ttsPath,
        mode: "nostream",
      },
    });
    const text = asr.content.find((item) => item.type === "text");
    console.log(
      `asr ok: ${text && text.type === "text" ? text.text : JSON.stringify(asr.structuredContent)}`,
    );
  } finally {
    await client.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
