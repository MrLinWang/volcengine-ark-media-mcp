import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

const AUDIO_MIME: Record<string, string> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".flac": "audio/flac",
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function isDataUri(value: string): boolean {
  return /^data:[^,]*,/i.test(value);
}

export function isAssetUri(value: string): boolean {
  return /^asset:\/\//i.test(value);
}

export function guessImageMime(filePath: string): string {
  return IMAGE_MIME[path.extname(filePath).toLowerCase()] ?? "image/png";
}

export function guessAudioMime(filePath: string): string {
  return AUDIO_MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

export function toDataUri(buffer: Buffer, mime: string): string {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

export async function readFileLimited(filePath: string, maxBytes: number): Promise<Buffer> {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw new Error(`不是文件: ${filePath}`);
  }
  if (stat.size > maxBytes) {
    throw new Error(
      `文件过大 (${(stat.size / 1024 / 1024).toFixed(1)} MB)，上限 ${(maxBytes / 1024 / 1024).toFixed(0)} MB: ${filePath}`,
    );
  }
  return fs.readFile(filePath);
}

export async function downloadBuffer(
  url: string,
  maxBytes: number,
  timeoutMs = 60_000,
): Promise<Buffer> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`下载失败 (${response.status} ${response.statusText}): ${url}`);
  }

  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > maxBytes) {
    throw new Error(`远程文件过大 (${(contentLength / 1024 / 1024).toFixed(1)} MB): ${url}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > maxBytes) {
    throw new Error(`远程文件过大 (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)} MB): ${url}`);
  }
  return Buffer.from(arrayBuffer);
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export function timestampForFile(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

export function randomSuffix(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function relativeSafeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80) || "media";
}

export function truncate(value: string, max = 800): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function pickString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}
