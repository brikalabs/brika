/**
 * Generic media convention for blocks.
 *
 * Blocks exchange media (images, audio, video, arbitrary files) as one of:
 *   - a URL string (`https://...`) or data URL (`data:image/png;base64,...`)
 *   - raw bytes (`Uint8Array`, carried natively over block IPC)
 *   - an envelope `{ url?, dataUrl?, bytes?, mimeType? }`
 *
 * `normalizeMedia` accepts ALL of these (plus the index-keyed object a
 * Uint8Array degrades to after a JSON round-trip), so a consumer block (face
 * detection, transcoding, display) can take `z.generic()` input and not care
 * what the producer emitted. Prefer URL/data-URL forms for values that cross
 * JSON surfaces (debug stream, run store); raw bytes for block-to-block
 * processing pipelines.
 */

export interface NormalizedMedia {
  /** http(s) location of the media, when known. */
  url?: string;
  /** Raw bytes, when carried inline. */
  bytes?: Uint8Array;
  /** MIME type, when known or sniffable. */
  mimeType?: string;
}

const DATA_URL = /^data:([^;,]+)?(;base64)?,/;

/** Normalize any supported media shape; null when the value is not media. */
export function normalizeMedia(value: unknown): NormalizedMedia | null {
  if (typeof value === 'string') {
    return normalizeString(value);
  }
  if (value instanceof Uint8Array) {
    return { bytes: value, mimeType: sniffMimeType(value) };
  }
  if (typeof value === 'object' && value !== null) {
    return normalizeObject(value);
  }
  return null;
}

function normalizeString(value: string): NormalizedMedia | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const dataMatch = DATA_URL.exec(trimmed);
  if (dataMatch) {
    const decoded = dataUrlToBytes(trimmed);
    return decoded ?? { url: trimmed, mimeType: dataMatch[1] };
  }
  if (/^https?:\/\//.test(trimmed) || trimmed.startsWith('blob:') || trimmed.startsWith('/')) {
    return { url: trimmed };
  }
  return null;
}

function normalizeObject(value: object): NormalizedMedia | null {
  const record: Record<string, unknown> = { ...value };

  // A Uint8Array that crossed a JSON boundary becomes { "0": 137, "1": 80, ... }
  const revived = bytesFromIndexObject(record);
  if (revived) {
    return { bytes: revived, mimeType: sniffMimeType(revived) };
  }

  const media: NormalizedMedia = {};
  if (typeof record.url === 'string' && record.url.length > 0) {
    media.url = record.url;
  }
  if (record.bytes instanceof Uint8Array) {
    media.bytes = record.bytes;
  } else if (typeof record.dataUrl === 'string') {
    const decoded = dataUrlToBytes(record.dataUrl);
    if (decoded) {
      media.bytes = decoded.bytes;
      media.mimeType = decoded.mimeType;
    }
  }
  if (typeof record.mimeType === 'string') {
    media.mimeType = record.mimeType;
  }
  if (!media.mimeType && media.bytes) {
    media.mimeType = sniffMimeType(media.bytes);
  }
  return media.url || media.bytes ? media : null;
}

/** Revive { "0": n, "1": n, ... } (JSON-degraded Uint8Array) into bytes. */
function bytesFromIndexObject(record: Record<string, unknown>): Uint8Array | null {
  const keys = Object.keys(record);
  if (keys.length === 0 || keys.length > 64 * 1024 * 1024) {
    return null;
  }
  if (!keys.every((k, i) => k === String(i) && typeof record[k] === 'number')) {
    return null;
  }
  const bytes = new Uint8Array(keys.length);
  for (let i = 0; i < keys.length; i++) {
    const n = record[String(i)];
    if (typeof n !== 'number' || n < 0 || n > 255 || !Number.isInteger(n)) {
      return null;
    }
    bytes[i] = n;
  }
  return bytes;
}

/** Encode bytes as a data URL (JSON-safe, renderable everywhere). */
export function bytesToDataUrl(bytes: Uint8Array, mimeType?: string): string {
  const mime = mimeType ?? sniffMimeType(bytes) ?? 'application/octet-stream';
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCodePoint(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

/** Decode a base64 data URL into bytes + mime; null for non-base64 data URLs. */
export function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mimeType?: string } | null {
  const match = /^data:([^;,]+)?;base64,(.*)$/s.exec(dataUrl.trim());
  if (!match) {
    return null;
  }
  try {
    const binary = atob(match[2] ?? '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.codePointAt(i) ?? 0;
    }
    return { bytes, mimeType: match[1] };
  } catch {
    return null;
  }
}

/** Sniff common image/video/audio container magics; undefined when unknown. */
export function sniffMimeType(bytes: Uint8Array): string | undefined {
  if (bytes.length < 12) {
    return undefined;
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'image/gif';
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return 'video/mp4';
  }
  return undefined;
}
