/**
 * HTTP client with caching, interceptors, and retry logic
 */

import { singleton } from '@brika/di';
import { RequestBuilder } from './builder';
import type { CacheAdapter } from './cache';
import { generateCacheKey, MemoryCache } from './cache';
import {
  DeduplicationInterceptor,
  DeduplicationSkipError,
  InterceptorChain,
  RetryInterceptor,
  TimeoutInterceptor,
} from './interceptors';
import type {
  HttpClientConfig,
  HttpHeaders,
  HttpMethod,
  HttpResponse,
  RequestBody,
  RequestConfig,
} from './types';
import { createHttpError, createNetworkError, isHttpError } from './utils/errors';
import { isJsonContentType, mergeHeaders, toHeadersInstance } from './utils/headers';
import { buildUrl } from './utils/url-builder';

/**
 * HTTP client for making requests with caching and interceptors
 */
@singleton()
export class HttpClient {
  #config: HttpClientConfig;
  #cache?: CacheAdapter;
  #interceptorChain: InterceptorChain;
  #deduplicationInterceptor?: DeduplicationInterceptor;

  /**
   * Create an HttpClient instance.
   * When used with DI, called without arguments for default configuration.
   */
  constructor() {
    this.#config = {
      timeout: 30_000, // 30 second timeout
      cache: new MemoryCache(), // Enable caching by default
      retry: {
        maxAttempts: 3,
        backoff: 'exponential',
        delay: 1000,
      },
    };
    this.#cache = this.#config.cache;
    this.#interceptorChain = new InterceptorChain();
    this.#setupInterceptors();
  }

  /**
   * Create a configured HttpClient instance (for non-DI usage).
   * Use this for tests or when you need custom configuration.
   */
  static create(config?: Partial<HttpClientConfig>): HttpClient {
    const client = new HttpClient();
    if (config) {
      client.#applyConfig(config);
    }
    return client;
  }

  /**
   * Apply configuration to the client
   */
  #applyConfig(config: Partial<HttpClientConfig>): void {
    this.#config = { ...this.#config, ...config };
    if (config.cache !== undefined) {
      this.#cache = config.cache ?? undefined;
    }
  }

  /**
   * Make a GET request
   */
  get<T = unknown>(url: string): RequestBuilder<T> {
    return this.#createBuilder<T>('GET', url);
  }

  /**
   * Make a POST request
   */
  post<T = unknown>(url: string, body?: RequestBody): RequestBuilder<T> {
    const builder = this.#createBuilder<T>('POST', url);
    return body ? builder.body(body) : builder;
  }

  /**
   * Make a PUT request
   */
  put<T = unknown>(url: string, body?: RequestBody): RequestBuilder<T> {
    const builder = this.#createBuilder<T>('PUT', url);
    return body ? builder.body(body) : builder;
  }

  /**
   * Make a PATCH request
   */
  patch<T = unknown>(url: string, body?: RequestBody): RequestBuilder<T> {
    const builder = this.#createBuilder<T>('PATCH', url);
    return body ? builder.body(body) : builder;
  }

  /**
   * Make a DELETE request
   */
  delete<T = unknown>(url: string): RequestBuilder<T> {
    return this.#createBuilder<T>('DELETE', url);
  }

  /**
   * Make a HEAD request
   */
  head<T = unknown>(url: string): RequestBuilder<T> {
    return this.#createBuilder<T>('HEAD', url);
  }

  /**
   * Make a OPTIONS request
   */
  options<T = unknown>(url: string): RequestBuilder<T> {
    return this.#createBuilder<T>('OPTIONS', url);
  }

  /**
   * Execute a request with full configuration
   */
  async execute<T = unknown>(config: RequestConfig): Promise<HttpResponse<T>> {
    try {
      // Execute request interceptors
      const processedConfig = await this.#interceptorChain.executeRequest(config);

      // Check cache
      const cachedResponse = await this.#checkCache<T>(processedConfig);
      if (cachedResponse) {
        return cachedResponse;
      }

      // Check for pending duplicate requests
      if (this.#deduplicationInterceptor && processedConfig.method === 'GET') {
        const cacheKey = generateCacheKey(processedConfig);
        const pendingRequest = this.#deduplicationInterceptor.getPendingRequest(cacheKey);

        if (pendingRequest) {
          return (await pendingRequest) as HttpResponse<T>;
        }

        // Register this request as pending
        const requestPromise = this.#executeRequest<T>(processedConfig);
        this.#deduplicationInterceptor.registerRequest(cacheKey, requestPromise);

        return requestPromise;
      }

      return await this.#executeRequest<T>(processedConfig);
    } catch (error) {
      // Skip deduplication errors
      if (error instanceof DeduplicationSkipError) {
        // This shouldn't happen due to the check above, but just in case
        throw new Error('Unexpected deduplication error');
      }

      if (isHttpError(error)) {
        return (await this.#interceptorChain.executeError(error, config)) as HttpResponse<T>;
      }

      throw error;
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.#cache?.clear();
  }

  /**
   * Invalidate cache by tag
   */
  invalidateCache(tag: string): void {
    this.#cache?.invalidateByTag(tag);
  }

  /**
   * Invalidate cache by tags
   */
  invalidateCacheTags(tags: string[]): void {
    this.#cache?.invalidateByTags(tags);
  }

  /**
   * Create a request builder
   */
  #createBuilder<T>(method: HttpMethod, url: string): RequestBuilder<T> {
    const baseConfig: Partial<RequestConfig> = {
      headers: this.#config.headers,
      timeout: this.#config.timeout,
      retry: this.#config.retry,
    };

    return new RequestBuilder<T>(method, url, (config) => this.execute<T>(config), baseConfig);
  }

  /**
   * Execute the actual HTTP request
   */
  async #executeRequest<T>(config: RequestConfig): Promise<HttpResponse<T>> {
    try {
      // Build URL
      const url = buildUrl(this.#config.baseUrl, config.url, config.params);

      // Prepare headers
      const headers = mergeHeaders(this.#config.headers, config.headers);

      // Prepare body
      const body = config.body ? this.#prepareBody(config.body, headers) : undefined;

      // Make fetch request (use globalThis.fetch for testability)
      const response = await globalThis.fetch(url, {
        method: config.method,
        headers: toHeadersInstance(headers),
        body,
        signal: config.signal,
        ...config.fetchOptions,
      });

      // Check for HTTP errors
      if (!response.ok) {
        throw await createHttpError(response, config);
      }

      // Parse response
      const data = await this.#parseResponse<T>(response);

      // Create response object
      const httpResponse: HttpResponse<T> = {
        data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        config,
        cached: false,
      };

      // Cache response if configured
      await this.#cacheResponse(httpResponse);

      // Execute response interceptors
      return await this.#interceptorChain.executeResponse(httpResponse);
    } catch (error) {
      if (isHttpError(error)) {
        throw error;
      }

      if (error instanceof Error) {
        throw createNetworkError(error, config);
      }

      throw error;
    }
  }

  /**
   * Check cache for a response
   */
  async #checkCache<T>(config: RequestConfig): Promise<HttpResponse<T> | null> {
    if (!this.#cache || !config.cache || config.cache.skip) {
      return null;
    }

    // Don't cache non-GET requests
    if (config.method !== 'GET') {
      return null;
    }

    // Skip cache if refresh is requested
    if (config.cache.refresh) {
      return null;
    }

    const cacheKey = config.cache.key ?? generateCacheKey(config);
    const cached = await this.#cache.get<HttpResponse<T>>(cacheKey);

    if (cached) {
      return {
        ...cached,
        cached: true,
      };
    }

    return null;
  }

  /**
   * Cache a response
   */
  async #cacheResponse<T>(response: HttpResponse<T>): Promise<void> {
    if (!this.#cache || !response.config.cache) {
      return;
    }

    // Only cache successful GET requests
    if (response.config.method !== 'GET' || response.status >= 400) {
      return;
    }

    const cacheKey = response.config.cache.key ?? generateCacheKey(response.config);

    await this.#cache.set(
      cacheKey,
      response,
      response.config.cache.ttl,
      response.config.cache.tags
    );
  }

  /**
   * Prepare request body
   */
  #prepareBody(
    body: RequestBody,
    headers: HttpHeaders
  ): string | Blob | ArrayBuffer | FormData | URLSearchParams | ReadableStream | null {
    // Handle JSON objects
    if (
      typeof body === 'object' &&
      !(body instanceof Blob) &&
      !(body instanceof ArrayBuffer) &&
      !(body instanceof FormData) &&
      !(body instanceof URLSearchParams) &&
      !(body instanceof ReadableStream)
    ) {
      return JSON.stringify(body);
    }

    // Handle other body types
    if (
      typeof body === 'string' ||
      body instanceof Blob ||
      body instanceof ArrayBuffer ||
      body instanceof FormData ||
      body instanceof URLSearchParams ||
      body instanceof ReadableStream
    ) {
      return body;
    }

    return null;
  }

  /**
   * Parse response data
   */
  async #parseResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type');

    // Handle JSON responses
    if (isJsonContentType(contentType)) {
      return (await response.json()) as T;
    }

    // Handle text responses
    if (contentType?.includes('text/')) {
      return (await response.text()) as T;
    }

    // Handle blob responses
    if (
      contentType?.includes('application/octet-stream') ||
      contentType?.includes('image/') ||
      contentType?.includes('video/') ||
      contentType?.includes('audio/')
    ) {
      return (await response.blob()) as T;
    }

    // Default to text
    return (await response.text()) as T;
  }

  /**
   * Set up built-in interceptors
   */
  #setupInterceptors(): void {
    // Add timeout interceptor
    if (this.#config.timeout) {
      this.#interceptorChain.addRequestInterceptor(new TimeoutInterceptor(this.#config.timeout));
    }

    // Add deduplication interceptor
    this.#deduplicationInterceptor = new DeduplicationInterceptor((config) =>
      this.#executeRequest(config)
    );
    this.#interceptorChain.addRequestInterceptor(this.#deduplicationInterceptor);

    // Add retry interceptor
    if (this.#config.retry) {
      this.#interceptorChain.addErrorInterceptor(
        new RetryInterceptor((config) => this.execute(config))
      );
    }

    // Add custom interceptors
    if (this.#config.interceptors?.request) {
      for (const interceptor of this.#config.interceptors.request) {
        this.#interceptorChain.addRequestInterceptor({ onRequest: interceptor });
      }
    }

    if (this.#config.interceptors?.response) {
      for (const interceptor of this.#config.interceptors.response) {
        this.#interceptorChain.addResponseInterceptor({ onResponse: interceptor });
      }
    }

    if (this.#config.interceptors?.error) {
      for (const interceptor of this.#config.interceptors.error) {
        this.#interceptorChain.addErrorInterceptor({ onError: interceptor });
      }
    }
  }
}
