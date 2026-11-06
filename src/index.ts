#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { log } from "./logger.js";
import { registerTools } from "./tools/index.js";

const INSTRUCTIONS = [
  "火山方舟 Agent Plan 媒体工具。",
  "图片/视频 URL 24 小时内有效，请及时转存。",
  "视频生成仅 Agent Plan Large/Max 套餐可用；Medium 会返回 UnsupportedModel。",
  "TTS 会把音频保存到输出目录，并同时返回 MCP audio content。",
  "ASR 支持本地路径、公网 URL 或 data URI，非 WAV 会自动用内置 ffmpeg 转码。",
  "所有工具都以 ark_ 开头，可用 ark_list_models 查看模型和套餐限制。",
].join("");

async function main(): Promise<void> {
  const config = loadConfig();
  const server = new McpServer(
    {
      name: "volcengine-ark-media-mcp",
      version: "1.0.0",
    },
    {
      capabilities: { tools: {} },
      instructions: INSTRUCTIONS,
    },
  );

  registerTools(server, config);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  log.info(
    `volcengine-ark-media-mcp 已启动；API Key ${config.apiKey ? "已配置" : "未配置"}；输出目录 ${config.outputDir}`,
  );
}

main().catch((error) => {
  log.error(`服务启动失败: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exit(1);
});
