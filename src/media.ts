import fs from "node:fs/promises";
import path from "node:path";
import {
  MAX_AUDIO_BYTES,
  MAX_IMAGE_BYTES,
  downloadBuffer,
  guessAudioMime,
  guessImageMime,
  isAssetUri,
  isDataUri,
  isHttpUrl,
  readFileLimited,
  toDataUri,
} from "./util.js";

export async function resolveImageInput(value: string): Promise<string> {
  const trimmed = value.trim();
  if (isHttpUrl(trimmed) || isDataUri(trimmed)) {
    return trimmed;
  }

  const filePath = path.resolve(trimmed);
  const buffer = await readFileLimited(filePath, MAX_IMAGE_BYTES);
  return toDataUri(buffer, guessImageMime(filePath));
}

export async function resolveAudioInput(value: string): Promise<string> {
  const trimmed = value.trim();
  if (isHttpUrl(trimmed) || isDataUri(trimmed)) {
    return trimmed;
  }

  const filePath = path.resolve(trimmed);
  const buffer = await readFileLimited(filePath, MAX_AUDIO_BYTES);
  return toDataUri(buffer, guessAudioMime(filePath));
}

export function resolveVideoInput(value: string): string {
  const trimmed = value.trim();
  if (isHttpUrl(trimmed) || isAssetUri(trimmed)) {
    return trimmed;
  }
  throw new Error(
    "视频参考素材只支持公网 URL 或 asset:// 素材 ID；本地视频请先上传到可访问的 URL。",
  );
}

export interface InputBytes {
  buffer: Buffer;
  filename?: string;
  mime?: string;
}

function decodeDataUri(value: string): InputBytes {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/is.exec(value);
  if (!match) {
    throw new Error("无效的 data URI");
  }
  const mime = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] ?? "";
  const buffer = isBase64
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");
  return { buffer, mime };
}

export async function readInputBytes(
  value: string,
  maxBytes = MAX_AUDIO_BYTES,
): Promise<InputBytes> {
  const trimmed = value.trim();
  if (isDataUri(trimmed)) {
    const decoded = decodeDataUri(trimmed);
    if (decoded.buffer.length > maxBytes) {
      throw new Error(
        `内联文件过大 (${(decoded.buffer.length / 1024 / 1024).toFixed(1)} MB)，上限 ${(maxBytes / 1024 / 1024).toFixed(0)} MB`,
      );
    }
    return decoded;
  }
  if (isHttpUrl(trimmed)) {
    return {
      buffer: await downloadBuffer(trimmed, maxBytes),
      filename: path.basename(new URL(trimmed).pathname) || undefined,
    };
  }

  const filePath = path.resolve(trimmed);
  return {
    buffer: await readFileLimited(filePath, maxBytes),
    filename: path.basename(filePath),
  };
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}
