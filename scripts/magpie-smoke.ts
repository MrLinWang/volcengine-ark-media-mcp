import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url =
  process.env.MAGPIE_MCP_URL ??
  "http://127.0.0.1:3425/mcp/run/volcengine-ark-media-mcp";

async function main(): Promise<void> {
  const transport = new StreamableHTTPClientTransport(new URL(url));
  const client = new Client({ name: "magpie-smoke", version: "1.0.0" });
  await client.connect(transport);

  try {
    const tools = await client.listTools();
    console.log(`connected: ${url}`);
    console.log(`tools (${tools.tools.length}): ${tools.tools.map((tool) => tool.name).join(", ")}`);

    const result = await client.callTool({ name: "ark_list_models", arguments: {} });
    const text = result.content.find((item) => item.type === "text");
    console.log(text && text.type === "text" ? text.text.split("\n")[0] : "ark_list_models ok");
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
