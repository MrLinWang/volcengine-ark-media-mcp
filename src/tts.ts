import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AppConfig } from "./config.js";
import { requireApiKey } from "./config.js";
import { ArkApiError } from "./errors.js";
import {
  asRecord,
  ensureDir,
  randomSuffix,
  timestampForFile,
  truncate,
} from "./util.js";

export type TtsFormat = "mp3" | "wav" | "ogg_opus";

export interface TtsInput {
  text: string;
  speaker?: string;
  format?: TtsFormat;
  sampleRate?: number;
  speechRate?: number;
  loudnessRate?: number;
  outputPath?: string;
}

export interface TtsResult {
  filePath: string;
  bytes: number;
  format: TtsFormat;
  sampleRate: number;
  mimeType: string;
  usage?: unknown;
  requestId?: string;
}

const MIME_BY_FORMAT: Record<TtsFormat, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg_opus: "audio/ogg",
};

const EXTENSION_BY_FORMAT: Record<TtsFormat, string> = {
  mp3: ".mp3",
  wav: ".wav",
  ogg_opus: ".ogg",
};

function outputFile(
  outputDir: string,
  format: TtsFormat,
  requestedPath?: string,
): string {
  if (requestedPath) {
    const resolved = path.resolve(requestedPath);
    const hasExtension = path.extname(resolved) !== "";
    return hasExtension ? resolved : `${resolved}${EXTENSION_BY_FORMAT[format]}`;
  }

  return path.join(
    outputDir,
    `tts-${timestampForFile()}-${randomSuffix()}${EXTENSION_BY_FORMAT[format]}`,
  );
}

function parseTtsLine(line: string): Record<string, unknown> | undefined {
  let value = line.trim();
  if (!value) {
    return undefined;
  }
  if (value.startsWith("event:")) {
    return undefined;
  }
  if (value.startsWith("data:")) {
    value = value.slice(5).trim();
    if (!value || value === "[DONE]") {
      return undefined;
    }
  }
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return undefined;
  }
}

export async function synthesizeSpeech(
  config: AppConfig,
  input: TtsInput,
): Promise<TtsResult> {
  const apiKey = requireApiKey(config);
  const format = input.format ?? "mp3";
  const sampleRate = input.sampleRate ?? 24000;
  const requestId = randomUUID();
  const url = `${config.ttsBaseUrl}/tts/unidirectional`;

  const reqParams: Record<string, unknown> = {
    text: input.text,
    speaker: input.speaker ?? config.ttsSpeaker,
    audio_params: {
      format,
      sample_rate: sampleRate,
    },
  };
  if (input.speechRate !== undefined || input.loudnessRate !== undefined) {
    (reqParams.audio_params as Record<string, unknown>).speech_rate = input.speechRate;
    (reqParams.audio_params as Record<string, unknown>).loudness_rate = input.loudnessRate;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
        "X-Api-Resource-Id": config.ttsResourceId,
        "X-Api-Request-Id": requestId,
        "X-Control-Require-Usage-Tokens-Return": "*",
      },
      body: JSON.stringify({
        user: { uid: "volcengine-ark-media-mcp" },
        req_params: reqParams,
      }),
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
  } catch (error) {
    throw new ArkApiError(
      `TTS 请求失败: ${error instanceof Error ? error.message : String(error)}`,
      { code: "NETWORK_ERROR", apiType: "tts", cause: error },
    );
  }

  const headerRequestId = response.headers.get("x-tt-logid") ?? requestId;

  if (!response.ok) {
    const text = await response.text();
    throw new ArkApiError(
      `TTS 接口返回 ${response.status}: ${truncate(text)}`,
      {
        code: `HTTP_${response.status}`,
        status: response.status,
        requestId: headerRequestId,
        apiType: "tts",
        details: text,
      },
    );
  }
  if (!response.body) {
    throw new ArkApiError("TTS 接口没有返回响应体", {
      code: "EMPTY_TTS_RESPONSE",
      requestId: headerRequestId,
      apiType: "tts",
    });
  }

  const decoder = new TextDecoder();
  const chunks: Buffer[] = [];
  let pending = "";
  let usage: unknown;
  let ended = false;
  let serverError: ArkApiError | undefined;

  const consumeLine = (line: string) => {
    const message = parseTtsLine(line);
    if (!message) {
      return;
    }
    const code = Number(message.code ?? 0);
    if (message.usage !== undefined) {
      usage = message.usage;
    }
    if (code === 20000000) {
      ended = true;
      return;
    }
    if (code > 0) {
      serverError = new ArkApiError(
        typeof message.message === "string" && message.message
          ? message.message
          : `TTS 合成失败 (code ${code})`,
        {
          code: String(code),
          requestId: headerRequestId,
          apiType: "tts",
          details: message,
        },
      );
      return;
    }
    if (typeof message.data === "string" && message.data) {
      chunks.push(Buffer.from(message.data, "base64"));
    }
  };

  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    if (serverError) {
      break;
    }
    pending += decoder.decode(chunk, { stream: true });
    let newline = pending.indexOf("\n");
    while (newline >= 0) {
      const line = pending.slice(0, newline);
      pending = pending.slice(newline + 1);
      consumeLine(line);
      newline = pending.indexOf("\n");
      if (ended || serverError) {
        break;
      }
    }
    if (ended) {
      break;
    }
  }
  pending += decoder.decode();
  if (!ended && !serverError && pending.trim()) {
    consumeLine(pending);
  }

  if (serverError) {
    throw serverError;
  }
  if (chunks.length === 0) {
    throw new ArkApiError("TTS 接口没有返回音频数据", {
      code: "EMPTY_TTS_AUDIO",
      requestId: headerRequestId,
      apiType: "tts",
    });
  }

  const audio = Buffer.concat(chunks);
  const filePath = outputFile(config.outputDir, format, input.outputPath);
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, audio);

  return {
    filePath,
    bytes: audio.length,
    format,
    sampleRate,
    mimeType: MIME_BY_FORMAT[format],
    usage,
    requestId: headerRequestId,
  };
}
