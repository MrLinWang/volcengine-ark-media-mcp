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
  const local = process.env.MCP_LOCAL === "1";
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(root, local ? "scripts/run-local.mjs" : "dist/index.js")],
    cwd: root,
    env: cleanEnv(),
    stderr: "pipe",
  });
  const client = new Client({ name: "volcengine-ark-media-smoke", version: "1.0.0" });

  await client.connect(transport);
  try {
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name).sort();
    console.log(`tools (${names.length}): ${names.join(", ")}`);

    const expected = [
      "ark_create_video_task",
      "ark_delete_video_task",
      "ark_generate_image",
      "ark_get_video_task",
      "ark_list_models",
      "ark_list_video_tasks",
      "ark_speech_to_text",
      "ark_text_to_speech",
      "ark_wait_video_task",
    ];
    for (const name of expected) {
      if (!names.includes(name)) {
        throw new Error(`missing tool ${name}`);
      }
    }

    const result = await client.callTool({ name: "ark_list_models", arguments: {} });
    const text = result.content.find((item) => item.type === "text");
    console.log(text && text.type === "text" ? text.text : JSON.stringify(result.structuredContent));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
