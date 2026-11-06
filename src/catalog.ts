import type { AppConfig } from "./config.js";

export interface ModelInfo {
  id: string;
  type: "image" | "video" | "tts" | "asr";
  plan: "all" | "large-max";
  description: string;
  default?: boolean;
  resourceId?: string;
}

export function modelCatalog(config: AppConfig): {
  models: ModelInfo[];
  defaults: Record<string, string>;
  notes: string[];
} {
  const models: ModelInfo[] = [
    {
      id: "doubao-seedream-5-0-pro",
      type: "image",
      plan: "all",
      description: "Seedream 5.0 Pro；文生图、单/多图生图、图层拆分。",
      default: config.imageModel === "doubao-seedream-5-0-pro",
    },
    {
      id: "doubao-seedream-5.0-flash",
      type: "image",
      plan: "all",
      description: "Seedream 5.0 Flash；速度更快、成本更低。",
      default: config.imageModel === "doubao-seedream-5.0-flash",
    },
    {
      id: "doubao-seedance-2.5",
      type: "video",
      plan: "large-max",
      description: "Seedance 2.5；有声视频、全模态参考、编辑、延长，最长 30 秒。",
      default: config.videoModel === "doubao-seedance-2.5",
    },
    {
      id: "doubao-seedance-2.0",
      type: "video",
      plan: "large-max",
      description: "Seedance 2.0；文生视频、图生视频、参考素材、有声视频。",
      default: config.videoModel === "doubao-seedance-2.0",
    },
    {
      id: "doubao-seedance-2.0-fast",
      type: "video",
      plan: "large-max",
      description: "Seedance 2.0 Fast；更快、更省额度。",
      default: config.videoModel === "doubao-seedance-2.0-fast",
    },
    {
      id: "doubao-seedance-2.0-mini",
      type: "video",
      plan: "large-max",
      description: "Seedance 2.0 Mini；轻量视频生成。",
      default: config.videoModel === "doubao-seedance-2.0-mini",
    },
    {
      id: "doubao-seed-tts-2.0",
      type: "tts",
      plan: "all",
      description: "豆包语音合成 2.0；通过 X-Api-Resource-Id 调用。",
      default: true,
      resourceId: config.ttsResourceId,
    },
    {
      id: "doubao-seed-asr-2.0",
      type: "asr",
      plan: "all",
      description: "豆包流式语音识别 2.0；通过 X-Api-Resource-Id 调用。",
      default: true,
      resourceId: config.asrResourceId,
    },
  ];

  return {
    models,
    defaults: {
      image: config.imageModel,
      video: config.videoModel,
      ttsSpeaker: config.ttsSpeaker,
      ttsResourceId: config.ttsResourceId,
      asrResourceId: config.asrResourceId,
      baseUrl: config.baseUrl,
    },
    notes: [
      "图片生成、TTS、ASR 在 Agent Plan Small/Medium/Large/Max 均可用。",
      "视频生成仅 Large/Max 套餐可用；Medium 调用会返回 UnsupportedModel。",
      "图片和视频产物 URL 有效期为 24 小时，请及时转存。",
      "TTS 音频保存在 ARK_MEDIA_OUTPUT_DIR（默认 ~/.arc-agent-media-mcp/outputs）。",
    ],
  };
}
