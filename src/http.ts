import { ArkApiError } from "./errors.js";
import { asRecord, pickString, truncate } from "./util.js";

export interface JsonRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  apiType?: string;
}

function requestIdFrom(headers: Headers): string | undefined {
  return (
    headers.get("x-request-id") ??
    headers.get("x-tt-logid") ??
    headers.get("x-tt-log-id") ??
    undefined
  );
}

function parseBody(text: string): unknown {
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function apiErrorFrom(
  status: number,
  statusText: string,
  text: string,
  requestId: string | undefined,
  apiType: string | undefined,
): ArkApiError {
  const parsed = asRecord(parseBody(text));
  const nested = asRecord(parsed.error);
  const code =
    pickString(nested, "code") ??
    pickString(parsed, "code") ??
    (status ? `HTTP_${status}` : "API_ERROR");
  const message =
    pickString(nested, "message") ??
    pickString(parsed, "message") ??
    (text ? truncate(text) : `${status} ${statusText}`);

  return new ArkApiError(message, {
    code,
    status,
    requestId,
    apiType,
    details: parseBody(text),
  });
}

export async function requestJson<T>(
  url: string,
  options: JsonRequestOptions = {},
): Promise<{ data: T; requestId?: string }> {
  const timeoutMs = options.timeoutMs ?? 180_000;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "POST",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new ArkApiError(
      `请求 ${url} 失败: ${error instanceof Error ? error.message : String(error)}`,
      { code: "NETWORK_ERROR", apiType: options.apiType, cause: error },
    );
  }

  const requestId = requestIdFrom(response.headers);
  const text = await response.text();

  if (!response.ok) {
    throw apiErrorFrom(response.status, response.statusText, text, requestId, options.apiType);
  }

  const data = parseBody(text);
  if (data === undefined) {
    throw new ArkApiError(`接口返回了非 JSON 内容: ${truncate(text)}`, {
      code: "INVALID_JSON",
      status: response.status,
      requestId,
      apiType: options.apiType,
    });
  }

  return { data: data as T, requestId };
}
