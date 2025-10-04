// src/utils/binaryMessageCodec.ts

/**
 * Simple binary encoder - prepends a message type (uint32)
 * and appends UTF-8 encoded JSON/string data.
 */
export function encodeMessage(type: number, data: string): ArrayBuffer {
  const dataBytes = new TextEncoder().encode(data);
  const buffer = new ArrayBuffer(4 + dataBytes.length);
  const view = new DataView(buffer);

  // Store message type as first 4 bytes (little-endian)
  view.setUint32(0, type, true);
  new Uint8Array(buffer, 4).set(dataBytes);

  return buffer;
}

/**
 * Simple binary decoder - extracts message type and UTF-8 decoded payload.
 */
export function decodeMessage(buffer: ArrayBuffer): { type: number; data: string } | null {
  if (buffer.byteLength < 4) return null;

  const view = new DataView(buffer);
  const type = view.getUint32(0, true);
  const dataBytes = new Uint8Array(buffer, 4);
  const data = new TextDecoder().decode(dataBytes);

  return { type, data };
}
