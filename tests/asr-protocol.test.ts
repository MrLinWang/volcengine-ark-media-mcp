import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gzipSync } from "node:zlib";
import {
  COMPRESSION,
  FLAGS,
  MSG_TYPE,
  SERIALIZATION,
  buildAudioRequest,
  buildFullClientRequest,
  isTargetWav,
  parseAsrResponse,
  parseWavFormat,
} from "../src/asr-protocol.js";

function wavHeader(): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24);
  header.writeUInt32LE(32000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(0, 40);
  return header;
}

function serverResponse(payload: unknown): Buffer {
  const json = gzipSync(Buffer.from(JSON.stringify(payload), "utf8"));
  const size = Buffer.alloc(4);
  size.writeUInt32BE(json.length, 0);
  const seq = Buffer.alloc(4);
  seq.writeInt32BE(-2, 0);
  return Buffer.concat([
    Buffer.from([
      (1 << 4) | 1,
      (MSG_TYPE.FULL_SERVER_RESPONSE << 4) | FLAGS.NEG_WITH_SEQUENCE,
      (SERIALIZATION.JSON << 4) | COMPRESSION.GZIP,
      0,
    ]),
    seq,
    size,
    json,
  ]);
}

describe("ASR protocol", () => {
  it("builds a gzip client request with sequence", () => {
    const request = buildFullClientRequest(1, { user: { uid: "test" } });
    assert.equal(request[0], 0x11);
    assert.equal(request[1] >> 4, MSG_TYPE.FULL_CLIENT_REQUEST);
    assert.equal(request[1] & 0x0f, FLAGS.POS_SEQUENCE);
    assert.equal(request.readInt32BE(4), 1);
    assert.ok(request.readUInt32BE(8) > 0);
  });

  it("builds a negative sequence for the last audio packet", () => {
    const request = buildAudioRequest(3, Buffer.from([1, 2, 3]), true);
    assert.equal(request[1] & 0x0f, FLAGS.NEG_WITH_SEQUENCE);
    assert.equal(request.readInt32BE(4), -3);
  });

  it("parses a gzipped server response and marks the last packet", () => {
    const response = parseAsrResponse(
      serverResponse({ result: { text: "你好，世界" } }),
    );
    assert.equal(response.code, 0);
    assert.equal(response.isLastPackage, true);
    assert.equal(response.sequence, -2);
    assert.equal(
      (response.payload as { result: { text: string } }).result.text,
      "你好，世界",
    );
  });

  it("parses a 16k mono 16bit WAV", () => {
    const wav = wavHeader();
    const format = parseWavFormat(wav);
    assert.equal(format.sampleRate, 16000);
    assert.equal(format.channels, 1);
    assert.equal(format.bitsPerSample, 16);
    assert.equal(isTargetWav(wav), true);
  });
});
