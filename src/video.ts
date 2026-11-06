import type { AppConfig } from "./config.js";
import { requireApiKey } from "./config.js";
import { AppError } from "./errors.js";
import { requestJson } from "./http.js";
import { resolveAudioInput, resolveImageInput, resolveVideoInput } from "./media.js";
import { asRecord, pickString, sleep } from "./util.js";

export type OmniReferenceTaskType = "auto" | "reference" | "edit" | "extend";

export interface CreateVideoInput {
  prompt?: string;
  model?: string;
  firstFrame?: string;
  lastFrame?: string;
  referenceImages?: string[];
  referenceVideos?: string[];
  referenceAudios?: string[];
  resolution?: string;
  ratio?: string;
  duration?: number;
  generateAudio?: boolean;
  watermark?: boolean;
  seed?: number;
  cameraFixed?: boolean;
  returnLastFrame?: boolean;
  omniReferenceTaskType?: OmniReferenceTaskType;
}

export interface VideoTask {
  id?: string;
  model?: string;
  status?: string;
  content?: {
    video_url?: string;
    last_frame_url?: string;
  };
  error?: {
    code?: string;
    message?: string;
  };
  [key: string]: unknown;
}

export interface CreateVideoResult {
  taskId: string;
  model: string;
  status: string;
  requestId?: string;
}

export interface VideoTaskListOptions {
  pageNum?: number;
  pageSize?: number;
  status?: string;
  taskIds?: string[];
  model?: string;
}

export function assertVideoSupportedByPlan(planTier: AppConfig["planTier"]): void {
  if (planTier === "small" || planTier === "medium") {
    throw new AppError(
      `当前配置的 Agent Plan 套餐为 ${planTier}，视频生成仅支持 Large 或 Max 套餐。`,
      {
        code: "PLAN_TIER_UNSUPPORTED_VIDEO",
        hint:
          "如果你已经升级套餐，请把 ARK_PLAN_TIER 改为 large/max，或删除该环境变量让 API 自行判断。",
      },
    );
  }
}

const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled", "expired"]);

function referenceMode(input: CreateVideoInput): boolean {
  return Boolean(
    input.referenceImages?.length ||
      input.referenceVideos?.length ||
      input.referenceAudios?.length,
  );
}

export function validateVideoInput(input: CreateVideoInput, model: string): void {
  const hasPrompt = Boolean(input.prompt?.trim());
  const hasMedia = Boolean(
    input.firstFrame ||
      input.lastFrame ||
      input.referenceImages?.length ||
      input.referenceVideos?.length ||
      input.referenceAudios?.length,
  );

  if (!hasPrompt && !hasMedia) {
    throw new AppError("视频生成至少需要 prompt、首帧/尾帧或参考素材之一。", {
      code: "INVALID_VIDEO_INPUT",
    });
  }

  if (input.lastFrame && !input.firstFrame) {
    throw new AppError("传入 last_frame 时必须同时传入 first_frame。", {
      code: "INVALID_VIDEO_INPUT",
    });
  }

  if ((input.firstFrame || input.lastFrame) && referenceMode(input)) {
    throw new AppError(
      "首帧/首尾帧模式与全模态参考素材模式互斥，不能在同一次请求中混用。",
      { code: "INVALID_VIDEO_INPUT" },
    );
  }

  if (
    input.referenceAudios?.length &&
    !input.referenceImages?.length &&
    !input.referenceVideos?.length &&
    /^doubao-seedance-2\.0/.test(model)
  ) {
    throw new AppError(
      "Seedance 2.0 系列不能只传参考音频，至少还需要 1 张参考图或 1 个参考视频；单独音频需要 Seedance 2.5。",
      { code: "INVALID_VIDEO_INPUT" },
    );
  }
}

export async function buildVideoContent(input: CreateVideoInput): Promise<Array<Record<string, unknown>>> {
  const content: Array<Record<string, unknown>> = [];

  if (input.prompt?.trim()) {
    content.push({ type: "text", text: input.prompt.trim() });
  }

  if (input.firstFrame) {
    content.push({
      type: "image_url",
      image_url: { url: await resolveImageInput(input.firstFrame) },
      role: "first_frame",
    });
  }

  if (input.lastFrame) {
    content.push({
      type: "image_url",
      image_url: { url: await resolveImageInput(input.lastFrame) },
      role: "last_frame",
    });
  }

  for (const image of input.referenceImages ?? []) {
    content.push({
      type: "image_url",
      image_url: { url: await resolveImageInput(image) },
      role: "reference_image",
    });
  }

  for (const video of input.referenceVideos ?? []) {
    content.push({
      type: "video_url",
      video_url: { url: resolveVideoInput(video) },
      role: "reference_video",
    });
  }

  for (const audio of input.referenceAudios ?? []) {
    content.push({
      type: "audio_url",
      audio_url: { url: await resolveAudioInput(audio) },
      role: "reference_audio",
    });
  }

  return content;
}

export async function createVideoTask(
  config: AppConfig,
  input: CreateVideoInput,
): Promise<CreateVideoResult> {
  assertVideoSupportedByPlan(config.planTier);
  const apiKey = requireApiKey(config);
  const model = input.model ?? config.videoModel;
  validateVideoInput(input, model);

  const content = await buildVideoContent(input);
  const body: Record<string, unknown> = {
    model,
    content,
    resolution: input.resolution,
    ratio: input.ratio ?? "adaptive",
    duration: input.duration ?? 5,
    generate_audio: input.generateAudio ?? false,
    watermark: input.watermark ?? true,
    seed: input.seed,
    camera_fixed: input.cameraFixed,
    return_last_frame: input.returnLastFrame,
    omni_reference_task_type: input.omniReferenceTaskType,
  };

  for (const key of Object.keys(body)) {
    if (body[key] === undefined) {
      delete body[key];
    }
  }

  const { data, requestId } = await requestJson<{ id?: string }>(
    `${config.baseUrl}/contents/generations/tasks`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      body,
      timeoutMs: config.requestTimeoutMs,
      apiType: "video",
    },
  );

  if (!data.id) {
    throw new AppError("视频任务创建接口没有返回任务 ID", {
      code: "EMPTY_VIDEO_TASK_ID",
      requestId,
      details: data,
    });
  }

  return { taskId: data.id, model, status: "queued", requestId };
}

export async function getVideoTask(
  config: AppConfig,
  taskId: string,
): Promise<{ task: VideoTask; requestId?: string }> {
  const apiKey = requireApiKey(config);
  const { data, requestId } = await requestJson<VideoTask>(
    `${config.baseUrl}/contents/generations/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      timeoutMs: config.requestTimeoutMs,
      apiType: "video",
    },
  );
  return { task: data, requestId };
}

export async function listVideoTasks(
  config: AppConfig,
  options: VideoTaskListOptions = {},
): Promise<{ result: Record<string, unknown>; requestId?: string }> {
  const apiKey = requireApiKey(config);
  const params = new URLSearchParams();
  params.set("page_num", String(options.pageNum ?? 1));
  params.set("page_size", String(options.pageSize ?? 20));
  if (options.status) {
    params.set("filter.status", options.status);
  }
  if (options.taskIds?.length) {
    params.set("filter.task_ids", options.taskIds.join(","));
  }
  if (options.model) {
    params.set("filter.model", options.model);
  }

  const { data, requestId } = await requestJson<Record<string, unknown>>(
    `${config.baseUrl}/contents/generations/tasks?${params.toString()}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      timeoutMs: config.requestTimeoutMs,
      apiType: "video",
    },
  );
  return { result: data, requestId };
}

export async function deleteVideoTask(
  config: AppConfig,
  taskId: string,
): Promise<{ result: Record<string, unknown>; requestId?: string }> {
  const apiKey = requireApiKey(config);
  const { data, requestId } = await requestJson<Record<string, unknown>>(
    `${config.baseUrl}/contents/generations/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
      timeoutMs: config.requestTimeoutMs,
      apiType: "video",
    },
  );
  return { result: data, requestId };
}

export interface WaitVideoResult {
  task: VideoTask;
  timedOut: boolean;
  polls: number;
  requestId?: string;
}

export async function waitForVideoTask(
  config: AppConfig,
  taskId: string,
  options: { timeoutSeconds?: number; pollIntervalSeconds?: number } = {},
): Promise<WaitVideoResult> {
  const timeoutSeconds = Math.min(Math.max(options.timeoutSeconds ?? 600, 5), 1800);
  const intervalSeconds = Math.min(Math.max(options.pollIntervalSeconds ?? 5, 2), 30);
  const deadline = Date.now() + timeoutSeconds * 1000;
  let polls = 0;
  let lastTask: VideoTask = { id: taskId };
  let lastRequestId: string | undefined;

  while (Date.now() <= deadline) {
    const { task, requestId } = await getVideoTask(config, taskId);
    polls += 1;
    lastTask = task;
    lastRequestId = requestId;

    const status = pickString(task, "status");
    if (status && TERMINAL_STATUSES.has(status)) {
      return { task, timedOut: false, polls, requestId: lastRequestId };
    }

    await sleep(intervalSeconds * 1000);
  }

  return {
    task: lastTask,
    timedOut: true,
    polls,
    requestId: lastRequestId,
  };
}

export function videoTaskSummary(task: VideoTask): Record<string, unknown> {
  const content = asRecord(task.content);
  const error = asRecord(task.error);
  return {
    id: task.id,
    model: task.model,
    status: task.status,
    videoUrl: pickString(content, "video_url"),
    lastFrameUrl: pickString(content, "last_frame_url"),
    errorCode: pickString(error, "code"),
    errorMessage: pickString(error, "message"),
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    resolution: task.resolution,
    ratio: task.ratio,
    duration: task.duration,
    frames: task.frames,
    usage: task.usage,
  };
}
