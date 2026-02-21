/**
 * Deduplication interceptor to prevent duplicate in-flight requests
 */

import { generateCacheKey } from '../../cache';
import type { HttpResponse, RequestConfig } from '../../types';
import type { RequestInterceptor } from '../types';

/**
 * Deduplication interceptor prevents duplicate requests
 */
export class DeduplicationInterceptor implements RequestInterceptor {
  readonly #pendingRequests = new Map<string, Promise<HttpResponse<unknown>>>();

  constructor(
    private readonly fetchFn: (config: RequestConfig) => Promise<HttpResponse<unknown>>
  ) {}

  async onRequest(config: RequestConfig): Promise<RequestConfig> {
    // Only deduplicate GET requests by default
    if (config.method !== 'GET') {
      return config;
    }

    const key = generateCacheKey(config);

    // Check if there's already a pending request
    const pendingRequest = this.#pendingRequests.get(key);

    if (pendingRequest) {
      // Wait for the pending request and throw to skip this request
      await pendingRequest;

      // This is a bit hacky, but we need to return the cached response
      // The actual implementation will be handled in the client
      throw new DeduplicationSkipError(key);
    }

    return config;
  }

  /**
   * Register a pending request
   */
  registerRequest(key: string, promise: Promise<HttpResponse<unknown>>): void {
    this.#pendingRequests.set(key, promise);

    // Clean up when request completes.
    // Use .then(fn, fn) instead of .finally() to avoid creating
    // an unhandled rejection when the request fails.
    const cleanup = () => this.#pendingRequests.delete(key);
    promise.then(cleanup, cleanup);
  }

  /**
   * Get a pending request
   */
  getPendingRequest(key: string): Promise<HttpResponse<unknown>> | undefined {
    return this.#pendingRequests.get(key);
  }

  /**
   * Check if a request is pending
   */
  hasPendingRequest(key: string): boolean {
    return this.#pendingRequests.has(key);
  }

  /**
   * Clear all pending requests
   */
  clear(): void {
    this.#pendingRequests.clear();
  }
}

/**
 * Internal error to signal that a request should be skipped
 */
export class DeduplicationSkipError extends Error {
  constructor(public readonly cacheKey: string) {
    super('Request skipped due to deduplication');
    this.name = 'DeduplicationSkipError';
  }
}
