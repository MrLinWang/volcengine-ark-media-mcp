---
name: volcengine-ark-media-mcp
description: Use the volcengine-ark-media-mcp MCP server to generate or edit images, create videos, synthesize speech, or transcribe audio with Volcengine Ark Agent Plan. Use for 火山方舟/豆包/Seedream/Seedance media requests and when choosing among ark_* tools.
metadata:
  short-description: "火山方舟 Agent Plan 媒体生成、TTS 与 ASR 使用指南"
---

# 火山方舟 Agent Plan 媒体 MCP

当环境中存在 `ark_*` 工具时，优先使用 `volcengine-ark-media-mcp`，不要自己拼 HTTP 请求。

## 先判断任务

- 生成/编辑图片 → `ark_generate_image`
- 生成视频、查询/等待/取消视频任务 → `ark_create_video_task`、`ark_get_video_task`、`ark_wait_video_task`、`ark_list_video_tasks`、`ark_delete_video_task`
- 文本转语音 → `ark_text_to_speech`
- 音频转文本 → `ark_speech_to_text`
- 不确定当前套餐、默认模型或可用模型 → 先调用 `ark_list_models`

不要用于普通文本对话、embedding、向量化或其他厂商的图片/视频/语音服务。

## 事前检查

- 图片、TTS、ASR 在 Agent Plan Small/Medium/Large/Max 均可用；视频仅 Large/Max 可用。
- 如果 `ARK_PLAN_TIER` 配成 `small`/`medium`，视频工具会直接返回套餐错误，不要重试同一调用，改为告知用户需要升级套餐。
- 如果 `ARK_PLAN_TIER` 是 `unknown` 或不设置，套餐能力由 API 实际返回决定；`UnsupportedModel` 就是当前套餐不支持。
- API Key 由 MCP server 的环境变量提供。不要向用户索要 Key，也不要把 Key 写进提示词或输出。

## 图片

`ark_generate_image` 输入要点：

- `prompt`：必要的画面描述或编辑指令。
- `image`：可选参考图，支持公网 URL、`data:image/...;base64,...` 或本地路径；多张参考图用数组。
- `size`：`1K`、`1.5K`、`2K` 或 `宽x高`；不确定时用 `1K` 做快速预览，最终稿用 `2K`。
- `output_format`：`png` 或 `jpeg`；`watermark` 默认开启。

返回的是图片 URL，24 小时有效。需要长期保存时提醒用户及时转存。

## 视频

推荐流程：

1. `ark_create_video_task` 创建任务，拿到 `task_id`。
2. `ark_wait_video_task` 等待完成；默认 600 秒，长视频可调到 1800 秒。
3. 如果等待超时，不要重新创建任务；用 `ark_get_video_task` 继续查同一个 `task_id`。

输入约束：

- 首帧 `first_frame`、尾帧 `last_frame` 与 `reference_images`/`reference_videos`/`reference_audios` 是互斥模式，不要混用。
- 传 `last_frame` 时必须同时传 `first_frame`。
- 参考视频只接受公网 URL 或 `asset://...`；本地视频路径不可用。
- Seedance 2.0 系列不能只传参考音频，至少还要一张参考图或一个参考视频；Seedance 2.5 可以单独用音频。
- 有声视频用 `generate_audio: true`；需要尾帧图时用 `return_last_frame: true`。

返回视频 URL，24 小时有效。`ark_delete_video_task` 只对 queued 任务执行取消，其他状态会删除任务记录。

## 语音合成

`ark_text_to_speech` 输入要点：

- `text`：要合成的文本。
- `speaker`：音色；不传时用服务端默认中文音色。
- `format`：`mp3`（默认）、`wav` 或 `ogg_opus`。
- `sample_rate`：默认 24000；需要给 ASR 复用时用 `16000` 和 `wav`。
- `speech_rate` / `loudness_rate`：可选，范围 -50 到 100。

结果会保存到 `ARK_MEDIA_OUTPUT_DIR`（默认 `~/.arc-agent-media-mcp/outputs`），同时以 MCP audio content 返回。回答时应给出 `file_path`，不要只贴 base64。

## 语音识别

`ark_speech_to_text` 输入要点：

- `audio`：本地路径、公网 URL 或 `data:audio/...;base64,...`。
- `mode`：文件转写用 `nostream`（准确率优先，默认）；需要边发边返回时用 `async`。
- 非 WAV 文件会由内置 ffmpeg 转成 16k 单声道 WAV，无需用户自己转码。

返回 `text`、`utterances` 和 `duration_ms`。如果用户要字幕，优先使用 `utterances` 的时间信息；不要自己猜时间戳。

## 错误处理

- `UnsupportedModel` / 套餐错误：说明需要 Large/Max，或当前 Key 不属于支持该模型的套餐；不要静默换模型或换厂商。
- 401/403：提醒用户检查是否使用 Agent Plan 专属 API Key。
- 额度/限流：把 API 的 message 和 request id 一并反馈，不要连续重试。
- 网络或超时：先判断任务是否已创建；视频任务用 `task_id` 继续查询，避免重复计费。

## 示例

- “生成一张赛博朋克猫的 1K 图片” → `ark_generate_image`，`size: "1K"`。
- “参考这两张图生成一张海报” → `ark_generate_image`，`image: ["路径1", "路径2"]`。
- “生成 5 秒 16:9 视频并等它完成” → `ark_create_video_task` → `ark_wait_video_task`。
- “把这段文字合成为 wav” → `ark_text_to_speech`，`format: "wav"`。
- “转写 meeting.mp3” → `ark_speech_to_text`，`mode: "nostream"`。
