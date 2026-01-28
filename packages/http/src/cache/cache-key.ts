/**
 * Cache key generation utilities
 */

import type { RequestConfig } from '../types';

/**
 * Generate a cache key from request configuration
 */
export function generateCacheKey(config: RequestConfig): string {
  const parts: string[] = [config.method, config.url];

  // Add sorted query parameters
  if (config.params && Object.keys(config.params).length > 0) {
    const sortedParams = Object.entries(config.params)
      .filter(([, value]) => value !== undefined && value !== null)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    if (sortedParams) {
      parts.push(sortedParams);
    }
  }

  // Add body hash for POST/PUT/PATCH requests
  if (config.body && ['POST', 'PUT', 'PATCH'].includes(config.method)) {
    const bodyHash = hashBody(config.body);
    if (bodyHash) {
      parts.push(bodyHash);
    }
  }

  return parts.join('|');
}

/**
 * Hash request body for cache key
 */
function hashBody(body: unknown): string {
  if (typeof body === 'string') {
    return simpleHash(body);
  }

  if (body instanceof FormData) {
    // FormData is not easily serializable, use a placeholder
    return 'formdata';
  }

  if (body instanceof Blob) {
    return `blob:${body.size}:${body.type}`;
  }

  if (body instanceof ArrayBuffer) {
    return `arraybuffer:${body.byteLength}`;
  }

  if (body instanceof URLSearchParams) {
    return simpleHash(body.toString());
  }

  if (typeof body === 'object' && body !== null) {
    try {
      return simpleHash(JSON.stringify(body));
    } catch {
      return 'object';
    }
  }

  return String(body);
}

/**
 * Simple string hash function (FNV-1a)
 */
function simpleHash(str: string): string {
  let hash = 2166136261;

  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return (hash >>> 0).toString(36);
}
