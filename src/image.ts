import type { AppConfig } from "./config.js";
import { requireApiKey } from "./config.js";
import { ArkApiError } from "./errors.js";
import { requestJson } from "./http.js";
import { resolveImageInput } from "./media.js";
import { asRecord, pickString } from "./util.js";

export interface GenerateImageInput {
  prompt: string;
  model?: string;
  image?: string | string[];
  size?: string;
  outputFormat?: "png" | "jpeg";
  watermark?: boolean;
  background?: "opaque" | "transparent";
}

export interface GeneratedImage {
  url?: string;
  size?: string;
  outputFormat?: string;
  background?: string;
  error?: unknown;
}

export interface GenerateImageResult {
  model: string;
  created?: number;
  images: GeneratedImage[];
  usage?: unknown;
  requestId?: string;
}

interface ImageApiResponse {
  model?: string;
  created?: number;
  data?: Array<Record<string, unknown>>;
  usage?: unknown;
}

export async function generateImage(
  config: AppConfig,
  input: GenerateImageInput,
): Promise<GenerateImageResult> {
  const apiKey = requireApiKey(config);
  const model = input.model ?? config.imageModel;

  const images = input.image
    ? Array.isArray(input.image)
      ? await Promise.all(input.image.map(resolveImageInput))
      : await resolveImageInput(input.image)
    : undefined;

  const body: Record<string, unknown> = {
    model,
    prompt: input.prompt,
    size: input.size ?? "2K",
    output_format: input.outputFormat ?? "png",
    watermark: input.watermark ?? true,
    response_format: "url",
  };
  if (images !== undefined) {
    body.image = images;
  }
  if (input.background !== undefined) {
    body.background = input.background;
  }

  const { data, requestId } = await requestJson<ImageApiResponse>(
    `${config.baseUrl}/images/generations`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      body,
      timeoutMs: config.requestTimeoutMs,
      apiType: "image",
    },
  );

  if (!Array.isArray(data.data) || data.data.length === 0) {
    throw new ArkApiError("图片生成接口没有返回任何图片", {
      code: "EMPTY_IMAGE_RESPONSE",
      requestId,
      apiType: "image",
      details: data,
    });
  }

  const result = data.data.map((item) => {
    const record = asRecord(item);
    return {
      url: pickString(record, "url"),
      size: pickString(record, "size"),
      outputFormat: pickString(record, "output_format"),
      background: pickString(record, "background"),
      error: record.error,
    };
  });

  return {
    model: data.model ?? model,
    created: data.created,
    images: result,
    usage: data.usage,
    requestId,
  };
}
