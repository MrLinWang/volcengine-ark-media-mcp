import { randomUUID } from "node:crypto";
import WebSocket, { type RawData } from "ws";
import {
  buildAudioRequest,
  buildFullClientRequest,
  makeAsrRequestPayload,
  parseAsrResponse,
  parseWavFormat,
  type AsrResponse,
} from "./asr-protocol.js";
import type { AppConfig } from "./config.js";
import { requireApiKey } from "./config.js";
import { AppError, ArkApiError } from "./errors.js";
import { convertToWav16kMono } from "./ffmpeg.js";
import { readInputBytes } from "./media.js";
import { asRecord, pickString, sleep } from "./util.js";

export type AsrMode = "nostream" | "async";

export interface AsrInput {
  audio: string;
  mode?: AsrMode;
  enableItn?: boolean;
  enablePunc?: boolean;
  enableDdc?: boolean;
  showUtterances?: boolean;
}

export interface AsrResult {
  text: string;
  utterances: unknown[];
  durationMs?: number;
  requestId: string;
  mode: AsrMode;
  audioBytes: number;
}

interface MessageWaiter {
  resolve: (message: AsrResponse) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

class MessageQueue {
  private readonly queue: AsrResponse[] = [];
  private readonly waiters: MessageWaiter[] = [];
  private error?: Error;

  push(message: AsrResponse): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.resolve(message);
      return;
    }
    this.queue.push(message);
  }

  fail(error: Error): void {
    this.error = error;
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  next(timeoutMs: number): Promise<AsrResponse> {
    const queued = this.queue.shift();
    if (queued) {
      return Promise.resolve(queued);
    }
    if (this.error) {
      return Promise.reject(this.error);
    }
    return new Promise<AsrResponse>((resolve, reject) => {
      const waiter: MessageWaiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) {
            this.waiters.splice(index, 1);
          }
          reject(
            new AppError(`等待 ASR 响应超时 (${Math.round(timeoutMs / 1000)}s)`, {
              code: "ASR_TIMEOUT",
            }),
          );
        }, timeoutMs),
      };
      this.waiters.push(waiter);
    });
  }
}

function rawDataToBuffer(data: RawData): Buffer {
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  if (Buffer.isBuffer(data)) {
    return data;
  }
  return Buffer.from(data);
}

function splitAudio(buffer: Buffer, segmentSize: number): Buffer[] {
  const segments: Buffer[] = [];
  for (let offset = 0; offset < buffer.length; offset += segmentSize) {
    segments.push(buffer.subarray(offset, Math.min(offset + segmentSize, buffer.length)));
  }
  return segments;
}

function responseError(response: AsrResponse): ArkApiError {
  const payload = asRecord(response.payload);
  const code =
    pickString(payload, "code") ??
    pickString(asRecord(payload.error), "code") ??
    String(response.code);
  const message =
    pickString(payload, "message") ??
    pickString(asRecord(payload.error), "message") ??
    `ASR 服务返回错误 (code ${code})`;
  return new ArkApiError(message, {
    code,
    status: response.code,
    apiType: "asr",
    details: response.payload,
  });
}

function mergeResult(
  response: AsrResponse,
  state: {
    text: string;
    utterances: unknown[];
    durationMs?: number;
  },
): void {
  const payload = asRecord(response.payload);
  const result = asRecord(payload.result);

  const text = pickString(result, "text");
  if (text) {
    state.text = text;
  } else if (Array.isArray(result.utterances)) {
    const joined = result.utterances
      .map((item) => pickString(asRecord(item), "text") ?? "")
      .join("");
    if (joined) {
      state.text = joined;
    }
  }

  if (Array.isArray(result.utterances)) {
    state.utterances = result.utterances;
  }

  const audioInfo = asRecord(payload.audio_info);
  const duration = audioInfo.duration;
  if (typeof duration === "number") {
    state.durationMs = duration;
  }
}

export async function transcribeAudio(
  config: AppConfig,
  input: AsrInput,
): Promise<AsrResult> {
  const apiKey = requireApiKey(config);
  const mode = input.mode ?? "nostream";
  const requestId = randomUUID();
  const connectId = randomUUID();

  const source = await readInputBytes(input.audio);
  const wav = await convertToWav16kMono(source.buffer, source.filename);
  const wavFormat = parseWavFormat(wav);
  const audioDurationMs = (wav.length / wavFormat.bytesPerSecond) * 1000;
  const overallTimeoutMs = Math.min(
    Math.max(config.requestTimeoutMs, audioDurationMs + 120_000),
    900_000,
  );

  const endpoint = `${config.asrBaseUrl}/${mode === "async" ? "bigmodel_async" : "bigmodel_nostream"}`;
  const queue = new MessageQueue();
  const ws = new WebSocket(endpoint, {
    headers: {
      "X-Api-Key": apiKey,
      "X-Api-Resource-Id": config.asrResourceId,
      "X-Api-Request-Id": requestId,
      "X-Api-Connect-Id": connectId,
      "X-Api-Sequence": "-1",
    },
    handshakeTimeout: 20_000,
    maxPayload: 10 * 1024 * 1024,
  });

  ws.on("message", (data) => {
    try {
      queue.push(parseAsrResponse(rawDataToBuffer(data)));
    } catch (error) {
      queue.fail(error instanceof Error ? error : new Error(String(error)));
    }
  });
  ws.on("error", (error) => queue.fail(error));
  ws.on("close", () => {
    queue.push({
      messageType: 0,
      flags: 0,
      serialization: 0,
      compression: 0,
      isLastPackage: true,
      code: 0,
      payload: undefined,
    });
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        ws.off("error", onError);
        resolve();
      };
      const onError = (error: Error) => {
        ws.off("open", onOpen);
        reject(
          new AppError(`无法连接 ASR WebSocket: ${error.message}`, {
            code: "ASR_CONNECT_FAILED",
            cause: error,
          }),
        );
      };
      ws.once("open", onOpen);
      ws.once("error", onError);
    });

    ws.send(
      buildFullClientRequest(
        1,
        makeAsrRequestPayload({
          enableItn: input.enableItn,
          enablePunc: input.enablePunc,
          enableDdc: input.enableDdc,
          showUtterances: input.showUtterances,
        }),
      ),
    );

    const first = await queue.next(20_000);
    if (first.code !== 0) {
      throw responseError(first);
    }

    const segmentSize = Math.max(
      3200,
      Math.floor(wavFormat.bytesPerSecond * 0.2),
    );
    const segments = splitAudio(wav, segmentSize);
    let aborted = false;

    const sender = (async () => {
      let sequence = 2;
      for (let index = 0; index < segments.length; index += 1) {
        if (aborted) {
          return;
        }
        const isLast = index === segments.length - 1;
        ws.send(buildAudioRequest(sequence, segments[index], isLast));
        if (!isLast) {
          sequence += 1;
        }
        await sleep(200);
      }
    })();

    const state = {
      text: "",
      utterances: [] as unknown[],
      durationMs: undefined as number | undefined,
    };

    const deadline = Date.now() + overallTimeoutMs;
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new AppError(
          `ASR 识别超时 (${Math.round(overallTimeoutMs / 1000)}s)`,
          { code: "ASR_TIMEOUT" },
        );
      }

      const response = await queue.next(Math.min(remaining, 120_000));
      if (response.code !== 0) {
        throw responseError(response);
      }
      mergeResult(response, state);
      if (response.isLastPackage) {
        break;
      }
    }

    aborted = true;
    await sender.catch(() => undefined);

    if (!state.text) {
      throw new AppError("ASR 没有返回识别文本", {
        code: "EMPTY_ASR_RESULT",
        requestId,
      });
    }

    return {
      text: state.text,
      utterances: state.utterances,
      durationMs: state.durationMs,
      requestId,
      mode,
      audioBytes: wav.length,
    };
  } finally {
    try {
      ws.close();
    } catch {
      ws.terminate();
    }
  }
}
