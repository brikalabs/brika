/**
 * Core types and interfaces for @brika/http
 */

import type { CacheAdapter } from './cache';

/**
 * HTTP methods supported by the client
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/**
 * HTTP headers as key-value pairs
 */
export type HttpHeaders = Record<string, string>;

/**
 * URL query parameters
 */
export type QueryParams = Record<string, string | number | boolean | undefined | null>;

/**
 * Request body types
 */
export type RequestBody =
  | string
  | Blob
  | ArrayBuffer
  | FormData
  | URLSearchParams
  | ReadableStream
  | Record<string, unknown>
  | null;

/**
 * Retry backoff strategy
 */
export type BackoffStrategy = 'linear' | 'exponential';

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts: number;
  /** Backoff strategy (default: 'exponential') */
  backoff: BackoffStrategy;
  /** Initial delay in milliseconds (default: 1000) */
  delay: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelay?: number;
  /** HTTP status codes that should trigger a retry (default: [408, 429, 500, 502, 503, 504]) */
  retryableStatusCodes?: number[];
  /** Predicate to determine if an error should be retried */
  shouldRetry?: (error: Error, attempt: number) => boolean;
}

/**
 * Cache options for a request
 */
export interface CacheOptions {
  /** Cache time-to-live in milliseconds */
  ttl: number;
  /** Custom cache key (overrides automatic key generation) */
  key?: string;
  /** Cache tags for group invalidation */
  tags?: string[];
  /** Whether to bypass cache for this request */
  skip?: boolean;
  /** Whether to force refresh (ignore existing cache) */
  refresh?: boolean;
}

/**
 * HTTP client configuration
 */
export interface HttpClientConfig {
  /** Base URL for all requests */
  baseUrl?: string;
  /** Default headers for all requests */
  headers?: HttpHeaders;
  /** Default timeout in milliseconds */
  timeout?: number;
  /** Cache adapter instance */
  cache?: CacheAdapter;
  /** Default retry configuration */
  retry?: RetryConfig;
  /** Default cache options */
  cacheDefaults?: Partial<CacheOptions>;
  /** Interceptors */
  interceptors?: {
    request?: RequestInterceptor[];
    response?: ResponseInterceptor[];
    error?: ErrorInterceptor[];
  };
}

/**
 * Request configuration for a single request
 */
export interface RequestConfig {
  /** HTTP method */
  method: HttpMethod;
  /** Request URL (can be relative to baseUrl) */
  url: string;
  /** URL query parameters */
  params?: QueryParams;
  /** Request headers */
  headers?: HttpHeaders;
  /** Request body */
  body?: RequestBody;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Cache options */
  cache?: CacheOptions;
  /** Retry configuration */
  retry?: RetryConfig;
  /** AbortSignal for request cancellation */
  signal?: AbortSignal;
  /** Custom fetch options to merge */
  fetchOptions?: RequestInit;
}

/**
 * HTTP response wrapper
 */
export interface HttpResponse<T = unknown> {
  /** Parsed response data */
  data: T;
  /** HTTP status code */
  status: number;
  /** HTTP status text */
  statusText: string;
  /** Response headers */
  headers: Headers;
  /** Original request config */
  config: RequestConfig;
  /** Whether response came from cache */
  cached: boolean;
}

/**
 * Request interceptor function
 */
export type RequestInterceptor = (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;

/**
 * Response interceptor function
 */
export type ResponseInterceptor = <T = unknown>(
  response: HttpResponse<T>
) => HttpResponse<T> | Promise<HttpResponse<T>>;

/**
 * Error interceptor function
 */
export type ErrorInterceptor = (
  error: HttpError,
  config: RequestConfig
) => Promise<HttpResponse> | Promise<never>;

/**
 * Custom HTTP error class
 */
export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly response?: Response,
    public readonly config?: RequestConfig
  ) {
    super(message);
    this.name = 'HttpError';
    Object.setPrototypeOf(this, HttpError.prototype);
  }

  /**
   * Check if error is a network error (no response received)
   */
  get isNetworkError(): boolean {
    return this.status === undefined;
  }

  /**
   * Check if error is a client error (4xx status code)
   */
  get isClientError(): boolean {
    return this.status !== undefined && this.status >= 400 && this.status < 500;
  }

  /**
   * Check if error is a server error (5xx status code)
   */
  get isServerError(): boolean {
    return this.status !== undefined && this.status >= 500;
  }

  /**
   * Check if error is retryable
   */
  get isRetryable(): boolean {
    if (this.isNetworkError) return true;
    if (!this.status) return false;

    const retryableStatusCodes = [408, 429, 500, 502, 503, 504];
    return retryableStatusCodes.includes(this.status);
  }
}

/**
 * Timeout error class
 */
export class TimeoutError extends HttpError {
  constructor(
    message: string,
    public readonly timeout: number,
    config?: RequestConfig
  ) {
    super(message, undefined, undefined, config);
    this.name = 'TimeoutError';
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}
