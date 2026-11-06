import { gunzipSync, gzipSync } from "node:zlib";

export const PROTOCOL_VERSION_V1 = 0b0001;
export const HEADER_SIZE_WORDS = 1;

export const MSG_TYPE = {
  FULL_CLIENT_REQUEST: 0b0001,
  AUDIO_ONLY_REQUEST: 0b0010,
  FULL_SERVER_RESPONSE: 0b1001,
  SERVER_ERROR_RESPONSE: 0b1111,
} as const;

export const FLAGS = {
  NO_SEQUENCE: 0b0000,
  POS_SEQUENCE: 0b0001,
  NEG_SEQUENCE: 0b0010,
  NEG_WITH_SEQUENCE: 0b0011,
} as const;

export const SERIALIZATION = {
  NO_SERIALIZATION: 0b0000,
  JSON: 0b0001,
} as const;

export const COMPRESSION = {
  GZIP: 0b0001,
} as const;

export interface AsrResponse {
  messageType: number;
  flags: number;
  serialization: number;
  compression: number;
  sequence?: number;
  isLastPackage: boolean;
  event?: number;
  code: number;
  payloadSize?: number;
  payload?: unknown;
}

function header(
  messageType: number,
  flags: number,
  serialization: number,
  compression: number,
): Buffer {
  return Buffer.from([
    (PROTOCOL_VERSION_V1 << 4) | HEADER_SIZE_WORDS,
    (messageType << 4) | flags,
    (serialization << 4) | compression,
    0x00,
  ]);
}

export function buildFullClientRequest(
  sequence: number,
  payload: Record<string, unknown>,
): Buffer {
  const compressed = gzipSync(Buffer.from(JSON.stringify(payload), "utf8"));
  const size = Buffer.alloc(4);
  size.writeUInt32BE(compressed.length, 0);
  const seq = Buffer.alloc(4);
  seq.writeInt32BE(sequence, 0);

  return Buffer.concat([
    header(
      MSG_TYPE.FULL_CLIENT_REQUEST,
      FLAGS.POS_SEQUENCE,
      SERIALIZATION.JSON,
      COMPRESSION.GZIP,
    ),
    seq,
    size,
    compressed,
  ]);
}

export function buildAudioRequest(
  sequence: number,
  audio: Buffer,
  isLast: boolean,
): Buffer {
  const compressed = gzipSync(audio);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(compressed.length, 0);
  const seq = Buffer.alloc(4);
  seq.writeInt32BE(isLast ? -sequence : sequence, 0);

  return Buffer.concat([
    header(
      MSG_TYPE.AUDIO_ONLY_REQUEST,
      isLast ? FLAGS.NEG_WITH_SEQUENCE : FLAGS.POS_SEQUENCE,
      SERIALIZATION.NO_SERIALIZATION,
      COMPRESSION.GZIP,
    ),
    seq,
    size,
    compressed,
  ]);
}

export function parseAsrResponse(message: Buffer): AsrResponse {
  if (message.length < 4) {
    throw new Error(`ASR 响应过短 (${message.length} bytes)`);
  }

  const headerSize = message[0] & 0x0f;
  const messageType = message[1] >> 4;
  const flags = message[1] & 0x0f;
  const serialization = message[2] >> 4;
  const compression = message[2] & 0x0f;

  let offset = headerSize * 4;
  if (offset > message.length) {
    throw new Error("ASR 响应头长度无效");
  }

  const result: AsrResponse = {
    messageType,
    flags,
    serialization,
    compression,
    isLastPackage: (flags & 0x02) !== 0,
    code: 0,
  };

  if (flags & 0x01) {
    if (offset + 4 > message.length) {
      throw new Error("ASR 响应缺少 sequence");
    }
    result.sequence = message.readInt32BE(offset);
    offset += 4;
  }
  if (flags & 0x04) {
    if (offset + 4 > message.length) {
      throw new Error("ASR 响应缺少 event");
    }
    result.event = message.readInt32BE(offset);
    offset += 4;
  }

  if (messageType === MSG_TYPE.FULL_SERVER_RESPONSE) {
    if (offset + 4 > message.length) {
      throw new Error("ASR 响应缺少 payload size");
    }
    result.payloadSize = message.readUInt32BE(offset);
    offset += 4;
  } else if (messageType === MSG_TYPE.SERVER_ERROR_RESPONSE) {
    if (offset + 8 > message.length) {
      throw new Error("ASR 错误响应缺少 code/size");
    }
    result.code = message.readInt32BE(offset);
    result.payloadSize = message.readUInt32BE(offset + 4);
    offset += 8;
  }

  let payload = message.subarray(offset);
  if (payload.length === 0) {
    return result;
  }

  if (compression === COMPRESSION.GZIP) {
    try {
      payload = gunzipSync(payload);
    } catch (error) {
      throw new Error(
        `ASR 响应 gzip 解压失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (serialization === SERIALIZATION.JSON) {
    const text = payload.toString("utf8");
    try {
      result.payload = JSON.parse(text);
    } catch {
      result.payload = text;
    }
  } else {
    result.payload = Buffer.from(payload);
  }

  return result;
}

export function makeAsrRequestPayload(options: {
  uid?: string;
  enableItn?: boolean;
  enablePunc?: boolean;
  enableDdc?: boolean;
  showUtterances?: boolean;
}): Record<string, unknown> {
  return {
    user: { uid: options.uid ?? "volcengine-ark-media-mcp" },
    audio: {
      format: "wav",
      codec: "raw",
      rate: 16000,
      bits: 16,
      channel: 1,
    },
    request: {
      model_name: "bigmodel",
      enable_itn: options.enableItn ?? true,
      enable_punc: options.enablePunc ?? true,
      enable_ddc: options.enableDdc ?? true,
      show_utterances: options.showUtterances ?? true,
      enable_nonstream: false,
    },
  };
}

export interface WavFormat {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  bytesPerSecond: number;
}

export function parseWavFormat(buffer: Buffer): WavFormat {
  if (
    buffer.length < 44 ||
    buffer.subarray(0, 4).toString("ascii") !== "RIFF" ||
    buffer.subarray(8, 12).toString("ascii") !== "WAVE"
  ) {
    throw new Error("不是有效的 WAV 文件");
  }

  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let audioFormat = 0;

  while (offset + 8 <= buffer.length) {
    const id = buffer.subarray(offset, offset + 4).toString("ascii");
    const size = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    if (id === "fmt " && dataStart + 16 <= buffer.length) {
      audioFormat = buffer.readUInt16LE(dataStart);
      channels = buffer.readUInt16LE(dataStart + 2);
      sampleRate = buffer.readUInt32LE(dataStart + 4);
      bitsPerSample = buffer.readUInt16LE(dataStart + 14);
    }
    if (id === "data") {
      break;
    }
    offset = dataStart + size + (size % 2);
  }

  if (audioFormat !== 1 || channels <= 0 || sampleRate <= 0 || bitsPerSample <= 0) {
    throw new Error("WAV 必须是 PCM 格式");
  }

  return {
    sampleRate,
    channels,
    bitsPerSample,
    bytesPerSecond: sampleRate * channels * (bitsPerSample / 8),
  };
}

export function isTargetWav(buffer: Buffer): boolean {
  try {
    const format = parseWavFormat(buffer);
    return (
      format.sampleRate === 16000 &&
      format.channels === 1 &&
      format.bitsPerSample === 16
    );
  } catch {
    return false;
  }
}
