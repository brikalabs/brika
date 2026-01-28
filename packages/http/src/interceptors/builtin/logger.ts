/**
 * Logger interceptor for request/response logging
 */

import type { HttpError, HttpResponse, RequestConfig } from '../../types';
import type { ErrorInterceptor, RequestInterceptor, ResponseInterceptor } from '../types';

export interface LoggerOptions {
  /** Whether to log request details */
  logRequests?: boolean;
  /** Whether to log response details */
  logResponses?: boolean;
  /** Whether to log errors */
  logErrors?: boolean;
  /** Custom logger function (defaults to console) */
  logger?: {
    log: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
  };
}

/**
 * Logger interceptor for debugging HTTP requests
 */
export class LoggerInterceptor
  implements RequestInterceptor, ResponseInterceptor, ErrorInterceptor
{
  readonly #requestTimestamps = new WeakMap<RequestConfig, number>();

  constructor(private readonly options: LoggerOptions = {}) {
    this.options = {
      logRequests: true,
      logResponses: true,
      logErrors: true,
      logger: console,
      ...options,
    };
  }

  onRequest(config: RequestConfig): RequestConfig {
    if (!this.options.logRequests) {
      return config;
    }

    this.#requestTimestamps.set(config, Date.now());

    const logger = this.options.logger!;
    logger.log(`→ ${config.method} ${config.url}`, {
      params: config.params,
      headers: config.headers,
      body: config.body,
    });

    return config;
  }

  onResponse<T = unknown>(response: HttpResponse<T>): HttpResponse<T> {
    if (!this.options.logResponses) {
      return response;
    }

    const duration = this.#getDuration(response.config);
    const logger = this.options.logger!;

    logger.log(
      `← ${response.status} ${response.config.method} ${response.config.url} (${duration}ms)`,
      {
        cached: response.cached,
        data: response.data,
      }
    );

    return response;
  }

  onError(error: HttpError, config: RequestConfig): Promise<never> {
    if (this.options.logErrors) {
      const duration = this.#getDuration(config);
      this.options.logger?.error(`✗ ${config.method} ${config.url} (${duration}ms)`, {
        message: error.message,
        status: error.status,
        isNetworkError: error.isNetworkError,
        isRetryable: error.isRetryable,
      });
    }

    return Promise.reject(error);
  }

  /**
   * Get request duration
   */
  #getDuration(config: RequestConfig): number {
    const start = this.#requestTimestamps.get(config);
    return start ? Date.now() - start : 0;
  }
}
