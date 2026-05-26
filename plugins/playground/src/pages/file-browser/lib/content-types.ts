import { extOf } from './path';

/**
 * Hint MIME types for the streaming read action so the browser uses the
 * right viewer (PDF, image, etc) without sniffing. Falls back to
 * `application/octet-stream` for anything not listed — the read pipeline
 * still works, but inline preview may be limited to "download to inspect".
 */
const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  json: 'application/json',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  html: 'text/html; charset=utf-8',
};

export function contentTypeFor(path: string): string {
  return CONTENT_TYPES[extOf(path)] ?? 'application/octet-stream';
}
