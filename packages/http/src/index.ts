/**
 * @brika/http - Modern HTTP client with caching and interceptors
 */

export { RequestBuilder } from './builder';
// Cache
export type { CacheAdapter, CacheEntry } from './cache';
export { generateCacheKey, MemoryCache, SqliteCache, type SqliteCacheOptions } from './cache';
export { HttpClient } from './client';
// Interceptors
export type { Interceptor } from './interceptors';
export {
  DeduplicationInterceptor,
  InterceptorChain,
  LoggerInterceptor,
  type LoggerOptions,
  RetryInterceptor,
  TimeoutInterceptor,
} from './interceptors';
// Types
export type {
  BackoffStrategy,
  CacheOptions,
  ErrorInterceptor,
  HttpClientConfig,
  HttpHeaders,
  HttpMethod,
  HttpResponse,
  QueryParams,
  RequestBody,
  RequestConfig,
  RequestInterceptor,
  ResponseInterceptor,
  RetryConfig,
} from './types';
export { HttpError, TimeoutError } from './types';
export {
  createHttpError,
  createNetworkError,
  createTimeoutError,
  isHttpError,
  isTimeoutError,
} from './utils/errors';
export { fromHeadersInstance, mergeHeaders, toHeadersInstance } from './utils/headers';
// Utilities
export { buildUrl, isAbsoluteUrl } from './utils/url-builder';
