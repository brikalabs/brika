/**
 * Header utilities for HTTP client
 */

import type { HttpHeaders } from '../types';

/**
 * Merge multiple header objects
 */
export function mergeHeaders(...headers: (HttpHeaders | undefined)[]): HttpHeaders {
  const result: HttpHeaders = {};

  for (const header of headers) {
    if (header) {
      Object.assign(result, header);
    }
  }

  return result;
}

/**
 * Convert headers object to Headers instance
 */
export function toHeadersInstance(headers?: HttpHeaders): Headers {
  const headersInstance = new Headers();

  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      headersInstance.set(key, value);
    }
  }

  return headersInstance;
}

/**
 * Convert Headers instance to plain object
 */
export function fromHeadersInstance(headers: Headers): HttpHeaders {
  const result: HttpHeaders = {};

  headers.forEach((value, key) => {
    result[key] = value;
  });

  return result;
}

/**
 * Get content type from headers
 */
export function getContentType(headers?: HttpHeaders | Headers): string | null {
  if (headers instanceof Headers) {
    return headers.get('content-type');
  }

  if (!headers) return null;

  const key = Object.keys(headers).find((k) => k.toLowerCase() === 'content-type');

  return key ? (headers[key] ?? null) : null;
}

/**
 * Check if content type is JSON
 */
export function isJsonContentType(contentType: string | null): boolean {
  return contentType?.includes('application/json') ?? false;
}
