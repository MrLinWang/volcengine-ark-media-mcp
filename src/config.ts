import os from "node:os";
import path from "node:path";
import { AppError, MissingApiKeyError } from "./errors.js";

export const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/plan/v3";
export const DEFAULT_TTS_BASE_URL = "https://openspeech.bytedance.com/api/v3/plan";
export const DEFAULT_ASR_BASE_URL = "wss://openspeech.bytedance.com/api/v3/plan/sauc";
export const DEFAULT_TTS_RESOURCE_ID = "seed-tts-2.0";
export const DEFAULT_ASR_RESOURCE_ID = "volc.seedasr.sauc.duration";
export const DEFAULT_IMAGE_MODEL = "doubao-seedream-5-0-pro";
export const DEFAULT_VIDEO_MODEL = "doubao-seedance-2.0";
export const DEFAULT_TTS_SPEAKER = "zh_female_gaolengyujie_uranus_bigtts";
export const DEFAULT_REQUEST_TIMEOUT_MS = 180_000;
export const PLAN_TIERS = ["small", "medium", "large", "max", "unknown"] as const;

export type PlanTier = (typeof PLAN_TIERS)[number];

export interface AppConfig {
  apiKey: string;
  baseUrl: string;
  ttsBaseUrl: string;
  asrBaseUrl: string;
  ttsResourceId: string;
  asrResourceId: string;
  imageModel: string;
  videoModel: string;
  ttsSpeaker: string;
  outputDir: string;
  requestTimeoutMs: number;
  planTier: PlanTier;
}

function env(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function positiveNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parsePlanTier(value: string | undefined): PlanTier {
  if (!value) {
    return "unknown";
  }
  const normalized = value.trim().toLowerCase();
  if ((PLAN_TIERS as readonly string[]).includes(normalized)) {
    return normalized as PlanTier;
  }
  throw new AppError(
    `ARK_PLAN_TIER 的值无效: "${value}"。可选值：small、medium、large、max、unknown。`,
    {
      code: "INVALID_PLAN_TIER",
      hint: "不设置时默认 unknown，由 API 调用结果判断套餐能力。",
    },
  );
}

export function loadConfig(): AppConfig {
  const outputDir =
    env("ARK_MEDIA_OUTPUT_DIR") ??
    path.join(os.homedir(), ".arc-agent-media-mcp", "outputs");

  return {
    apiKey: env("ARC_AGENT_PLAN_KEY") ?? env("ARK_API_KEY") ?? "",
    baseUrl: withoutTrailingSlash(env("ARK_BASE_URL") ?? DEFAULT_BASE_URL),
    ttsBaseUrl: withoutTrailingSlash(env("ARK_TTS_BASE_URL") ?? DEFAULT_TTS_BASE_URL),
    asrBaseUrl: withoutTrailingSlash(env("ARK_ASR_BASE_URL") ?? DEFAULT_ASR_BASE_URL),
    ttsResourceId: env("ARK_TTS_RESOURCE_ID") ?? DEFAULT_TTS_RESOURCE_ID,
    asrResourceId: env("ARK_ASR_RESOURCE_ID") ?? DEFAULT_ASR_RESOURCE_ID,
    imageModel: env("ARK_IMAGE_MODEL") ?? DEFAULT_IMAGE_MODEL,
    videoModel: env("ARK_VIDEO_MODEL") ?? DEFAULT_VIDEO_MODEL,
    ttsSpeaker: env("ARK_TTS_SPEAKER") ?? DEFAULT_TTS_SPEAKER,
    outputDir: path.resolve(outputDir),
    requestTimeoutMs: positiveNumber(env("ARK_REQUEST_TIMEOUT_MS"), DEFAULT_REQUEST_TIMEOUT_MS),
    planTier: parsePlanTier(env("ARK_PLAN_TIER")),
  };
}

export function requireApiKey(config: AppConfig): string {
  if (!config.apiKey) {
    throw new MissingApiKeyError();
  }
  return config.apiKey;
}
