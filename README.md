# volcengine-ark-media-mcp

火山方舟 Agent Plan 媒体 MCP Server。通过 MCP 工具调用：

- 图片生成：Seedream 5.0 Pro / 5.0 Flash
- 视频生成：Seedance 2.5 / 2.0 系列（任务创建、查询、等待、列表、取消/删除）
- 语音合成：豆包语音合成 2.0
- 语音识别：豆包流式语音识别 2.0

> Agent Plan Medium 支持图片、TTS、ASR，不支持视频；视频工具会返回明确的套餐提示。

## 工具

| 工具 | 作用 |
| --- | --- |
| `ark_generate_image` | 文生图、单图/多图生图，返回图片 URL |
| `ark_create_video_task` | 创建视频生成任务 |
| `ark_get_video_task` | 查询任务状态和视频 URL |
| `ark_wait_video_task` | 轮询等待任务结束 |
| `ark_list_video_tasks` | 分页列出任务 |
| `ark_delete_video_task` | 取消排队任务或删除任务 |
| `ark_text_to_speech` | 文本转语音，保存文件并返回音频内容 |
| `ark_speech_to_text` | 音频转文本，支持常见格式 |
| `ark_list_models` | 列出模型、默认值和套餐限制 |

## 快速开始

```powershell
npm install
Copy-Item .env.example .env
# 编辑 .env，填入 ARC_AGENT_PLAN_KEY
npm run build
node --env-file=.env dist/index.js
```

本地调试也可以直接：

```powershell
npm run dev
```

## MCP 客户端配置

### Codex

在 `~/.codex/config.toml` 中加入：

```toml
[mcp_servers.volcengine-ark-media-mcp]
command = "node"
args = ["E:\\Codes\\arc-agent-media-mcp\\dist\\index.js"]
env = { ARC_AGENT_PLAN_KEY = "你的 Agent Plan API Key" }
```

### Claude Code / Claude Desktop

```json
{
  "mcpServers": {
    "volcengine-ark-media-mcp": {
      "command": "node",
      "args": ["E:\\Codes\\arc-agent-media-mcp\\dist\\index.js"],
      "env": {
        "ARC_AGENT_PLAN_KEY": "你的 Agent Plan API Key"
      }
    }
  }
}
```

### 通过 npx（npm 包发布后）

```json
{
  "mcpServers": {
    "volcengine-ark-media-mcp": {
      "command": "npx",
      "args": ["-y", "volcengine-ark-media-mcp"],
      "env": {
        "ARC_AGENT_PLAN_KEY": "你的 Agent Plan API Key"
      }
    }
  }
}
```

## 在 magpie 中本地安装

当前没有 npm 账号时，先用本地 wrapper 安装：

```powershell
magpie library mcp add volcengine-ark-media-mcp node E:\Codes\arc-agent-media-mcp\scripts\run-local.mjs agents=codex
magpie library sync
```

> 上面的 `E:\Codes\arc-agent-media-mcp` 是本机示例路径；请替换成你实际 clone 的仓库目录。

`scripts/run-local.mjs` 会从仓库根目录的 `.env` 读取 `ARC_AGENT_PLAN_KEY`，再启动 `dist/index.js`。Windows 下也可以直接用 `scripts\run-local.cmd`。

也可以在 magpie 的 **Library → MCP servers → 添加** 中填写：

- Command: `node`
- Args: `E:\Codes\arc-agent-media-mcp\dist\index.js`
- Environment: `ARC_AGENT_PLAN_KEY=你的 Agent Plan API Key`

如果 magpie 已经在运行，命令行添加后需要重启一次 magpie，让运行中的网关加载新 server；只重启 Codex 不够。通过 magpie GUI 添加则不需要重启。安装后重启对应 agent，让 magpie 写入的 MCP 配置生效。

## 配套 Skill

仓库包含 `skills/volcengine-ark-media-mcp/SKILL.md`，用于教 agent 在图片、视频、TTS、ASR 场景中选择正确的 `ark_*` 工具，并处理套餐限制、媒体 URL 过期和本地文件输入。

安装到 Codex：

```powershell
Copy-Item -Recurse -Force .\skills\volcengine-ark-media-mcp "$HOME\.codex\skills\volcengine-ark-media-mcp"
```

在 magpie 中可从本仓库的 `skills/volcengine-ark-media-mcp` 安装该 Skill。

### 上架 magpie 市场

magpie 的 MCP 市场搜索来自官方 MCP Registry。需要先发布 npm 包并注册 `server.json`，步骤见 [PUBLISHING.md](PUBLISHING.md)。发布完成后，在 magpie 中搜索 `volcengine` 或 `ark` 即可看到并安装。

## 环境变量

| 变量 | 必填 | 默认值 |
| --- | --- | --- |
| `ARC_AGENT_PLAN_KEY` | 是 | — |
| `ARK_API_KEY` | 兼容别名 | — |
| `ARK_BASE_URL` | 否 | `https://ark.cn-beijing.volces.com/api/plan/v3` |
| `ARK_TTS_BASE_URL` | 否 | `https://openspeech.bytedance.com/api/v3/plan` |
| `ARK_ASR_BASE_URL` | 否 | `wss://openspeech.bytedance.com/api/v3/plan/sauc` |
| `ARK_TTS_RESOURCE_ID` | 否 | `seed-tts-2.0` |
| `ARK_ASR_RESOURCE_ID` | 否 | `volc.seedasr.sauc.duration` |
| `ARK_IMAGE_MODEL` | 否 | `doubao-seedream-5-0-pro` |
| `ARK_VIDEO_MODEL` | 否 | `doubao-seedance-2.0` |
| `ARK_TTS_SPEAKER` | 否 | `zh_female_gaolengyujie_uranus_bigtts` |
| `ARK_MEDIA_OUTPUT_DIR` | 否 | `~/.arc-agent-media-mcp/outputs` |
| `ARK_REQUEST_TIMEOUT_MS` | 否 | `180000` |
| `ARK_PLAN_TIER` | 否 | `unknown`；可选 `small`、`medium`、`large`、`max` |
| `ARK_DEBUG` | 否 | `0`；设为 `1` 输出调试日志 |

## 套餐等级配置

套餐等级本身由火山方舟账号里的 Agent Plan 订阅决定，MCP 不能修改；每个用户使用自己的 `ARC_AGENT_PLAN_KEY`，该 Key 所属的订阅就是实际套餐等级。

`ARK_PLAN_TIER` 只是 MCP 侧的本地提示/提前校验开关，不会改变实际权限：

- 设置为 `medium` 或 `small`：`ark_list_models` 会标记视频模型不可用，`ark_create_video_task` 会在调用 API 前直接返回“需要 Large/Max”的错误。
- 设置为 `large` 或 `max`：视频工具正常调用。
- 不设置或设置为 `unknown`：不提前判断，由火山方舟 API 的实际返回决定（Medium 会返回 `UnsupportedModel`）。

示例：

```powershell
# .env
ARC_AGENT_PLAN_KEY=你的 Key
ARK_PLAN_TIER=medium
```

如果升级了套餐，记得把 `ARK_PLAN_TIER` 改成 `large`/`max`，或删除该变量。

## 使用示例

生成图片：

> 用 ark_generate_image 生成一张 1K 的赛博朋克猫咪图片，提示词：……

生成视频（需要 Large/Max）：

> 用 ark_create_video_task 创建 5 秒 16:9 视频，然后立刻用 ark_wait_video_task 等待完成。

语音合成：

> 用 ark_text_to_speech 把“你好，欢迎使用火山方舟”合成成 mp3。

语音识别：

> 用 ark_speech_to_text 转写 `C:\audio\meeting.mp3`。

## 注意事项

- 图片和视频 URL 有效期为 24 小时，请及时转存。
- 视频参考视频只支持公网 URL 或 `asset://` 素材 ID；本地视频需先上传。
- TTS 输出默认保存到 `~/.arc-agent-media-mcp/outputs`，同时以 MCP audio content 返回。
- ASR 非 WAV 文件会通过内置 `ffmpeg-static` 转为 16k 单声道 WAV。
- 所有工具都会消耗 Agent Plan 额度。

## 测试

```powershell
npm run build
npm test
npm run smoke:mcp
npm run smoke:magpie
$env:RUN_LIVE="1"; npm run smoke:live
```

`smoke:magpie` 需要 magpie 已重启并加载本 server；`smoke:live` 会调用真实的图片、TTS、ASR，并在 Medium 套餐上验证视频返回 `UnsupportedModel`。

## License

MIT
