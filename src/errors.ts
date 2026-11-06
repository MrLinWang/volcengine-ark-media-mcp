export interface AppErrorOptions {
  code?: string;
  status?: number;
  requestId?: string;
  hint?: string;
  details?: unknown;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly requestId?: string;
  readonly hint?: string;
  readonly details?: unknown;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code ?? "APP_ERROR";
    this.status = options.status;
    this.requestId = options.requestId;
    this.hint = options.hint;
    this.details = options.details;
  }
}

export class MissingApiKeyError extends AppError {
  constructor() {
    super(
      "缺少火山方舟 Agent Plan API Key。请设置 ARC_AGENT_PLAN_KEY（或 ARK_API_KEY）环境变量。",
      {
        code: "MISSING_API_KEY",
        hint: "本地调试可用 `node --env-file=.env dist/index.js`；在 magpie 中安装时请在 MCP 编辑器里填写环境变量。",
      },
    );
  }
}

export class ArkApiError extends AppError {
  constructor(
    message: string,
    options: AppErrorOptions & { apiType?: string } = {},
  ) {
    super(message, options);
    this.apiType = options.apiType;
  }

  readonly apiType?: string;

  userMessage(): string {
    const parts: string[] = [];

    if (
      this.code === "UnsupportedModel" ||
      /UnsupportedModel/i.test(this.message) ||
      /does not support the agent plan feature/i.test(this.message)
    ) {
      parts.push(
        "当前 Agent Plan 套餐不支持该模型。视频生成需要 Large 或 Max 套餐；图片生成、TTS、ASR 在 Medium 套餐可用。",
      );
    } else if (this.status === 401 || this.status === 403) {
      parts.push(
        "API Key 无效或没有权限。请确认使用的是 Agent Plan 专属 API Key，而不是其他方舟或 Coding Plan Key。",
      );
    } else if (/quota|exceeded|limit/i.test(this.message)) {
      parts.push("调用额度不足或触发限流。请检查 Agent Plan 套餐额度后重试。");
    } else {
      parts.push(this.message);
    }

    if (this.requestId) {
      parts.push(`request id: ${this.requestId}`);
    }
    if (this.hint) {
      parts.push(this.hint);
    }

    return parts.join("\n");
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ArkApiError) {
    return error.userMessage();
  }
  if (error instanceof AppError) {
    return error.hint ? `${error.message}\n${error.hint}` : error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function errorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof AppError) {
    return {
      code: error.code,
      status: error.status,
      requestId: error.requestId,
      hint: error.hint,
      details: error.details,
    };
  }
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { message: String(error) };
}
