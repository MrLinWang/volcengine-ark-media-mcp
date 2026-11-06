import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { AppError } from "./errors.js";
import { isTargetWav } from "./asr-protocol.js";

const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;
const require = createRequire(import.meta.url);
const ffmpegStaticPath = require("ffmpeg-static") as string | null;

function runFfmpeg(
  executable: string,
  args: string[],
  timeoutMs: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let bytes = 0;
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        reject(
          new AppError(`ffmpeg 转换超时 (${Math.round(timeoutMs / 1000)}s)`, {
            code: "FFMPEG_TIMEOUT",
          }),
        );
      }
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_OUTPUT_BYTES) {
        child.kill();
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(
            new AppError("ffmpeg 输出过大，超过 100 MB", {
              code: "FFMPEG_OUTPUT_TOO_LARGE",
            }),
          );
        }
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(
        new AppError(
          `无法启动 ffmpeg (${executable}): ${error.message}`,
          { code: "FFMPEG_NOT_FOUND", cause: error },
        ),
      );
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve(Buffer.concat(stdout));
        return;
      }
      reject(
        new AppError(
          `ffmpeg 转换失败 (exit ${code}): ${Buffer.concat(stderr).toString("utf8").trim()}`,
          { code: "FFMPEG_FAILED" },
        ),
      );
    });
  });
}

export async function convertToWav16kMono(
  input: Buffer,
  inputName?: string,
): Promise<Buffer> {
  if (isTargetWav(input)) {
    return input;
  }

  const extension = inputName ? path.extname(inputName) : "";
  const tempPath = path.join(
    os.tmpdir(),
    `ark-media-input-${randomUUID()}${extension || ".bin"}`,
  );
  await fs.writeFile(tempPath, input);

  try {
    const executable = ffmpegStaticPath ?? "ffmpeg";
    const output = await runFfmpeg(
      executable,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        tempPath,
        "-vn",
        "-acodec",
        "pcm_s16le",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "wav",
        "pipe:1",
      ],
      120_000,
    );

    if (!isTargetWav(output)) {
      throw new AppError("ffmpeg 输出不是 16k 单声道 16bit WAV", {
        code: "FFMPEG_INVALID_OUTPUT",
      });
    }
    return output;
  } finally {
    await fs.unlink(tempPath).catch(() => undefined);
  }
}
