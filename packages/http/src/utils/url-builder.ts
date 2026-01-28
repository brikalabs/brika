/**
 * URL building utilities for HTTP client
 */

import type { QueryParams } from '../types';

/**
 * Build a complete URL from base URL, path, and query parameters
 */
export function buildUrl(baseUrl: string | undefined, path: string, params?: QueryParams): string {
  // Handle absolute URLs
  if (isAbsoluteUrl(path)) {
    return addQueryParams(path, params);
  }

  // Handle relative URLs
  if (!baseUrl) {
    return addQueryParams(path, params);
  }

  // Combine base URL and path
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const relativePath = path.startsWith('/') ? path : `/${path}`;
  const fullUrl = `${base}${relativePath}`;

  return addQueryParams(fullUrl, params);
}

/**
 * Add query parameters to a URL
 */
export function addQueryParams(url: string, params?: QueryParams): string {
  if (!params || Object.keys(params).length === 0) {
    return url;
  }

  const urlObj = new URL(url, 'https://placeholder.com');

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      urlObj.searchParams.set(key, String(value));
    }
  }

  // Handle relative URLs
  if (!isAbsoluteUrl(url)) {
    return `${urlObj.pathname}${urlObj.search}`;
  }

  return urlObj.toString();
}

/**
 * Replace URL path parameters (e.g., /users/:id -> /users/123)
 */
export function replacePathParams(path: string, params: Record<string, string>): string {
  let result = path;

  for (const [key, value] of Object.entries(params)) {
    result = result.replace(`:${key}`, encodeURIComponent(value));
  }

  return result;
}

/**
 * Check if a URL is absolute
 */
export function isAbsoluteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * Extract query parameters from URL
 */
export function extractQueryParams(url: string): QueryParams {
  const urlObj = new URL(url, 'https://placeholder.com');
  const params: QueryParams = {};

  urlObj.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  return params;
}
