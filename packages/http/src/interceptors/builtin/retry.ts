/**
 * Retry interceptor for automatic request retries
 */

import type { HttpError, HttpResponse, RequestConfig, RetryConfig } from '../../types';
import type { ErrorInterceptor } from '../types';

const DEFAULT_RETRYABLE_STATUS_CODES = [
  408,
  429,
  500,
  502,
  503,
  504,
];

/**
 * Retry interceptor with exponential/linear backoff
 */
export class RetryInterceptor implements ErrorInterceptor {
  readonly #retryAttempts = new WeakMap<RequestConfig, number>();

  constructor(private readonly fetchFn: (config: RequestConfig) => Promise<HttpResponse>) {}

  async onError(error: HttpError, config: RequestConfig): Promise<HttpResponse> {
    const retryConfig = config.retry;

    if (!retryConfig || !this.#shouldRetry(error, config, retryConfig)) {
      throw error;
    }

    const attempt = this.#getAttempt(config);

    if (attempt >= retryConfig.maxAttempts) {
      throw error;
    }

    // Calculate delay
    const delay = this.#calculateDelay(attempt, retryConfig);

    // Wait before retrying
    await this.#sleep(delay);

    // Increment attempt counter
    this.#retryAttempts.set(config, attempt + 1);
    return await this.fetchFn(config);
  }

  /**
   * Check if error should be retried
   */
  #shouldRetry(error: HttpError, config: RequestConfig, retryConfig: RetryConfig): boolean {
    // Use custom shouldRetry if provided
    if (retryConfig.shouldRetry) {
      const attempt = this.#getAttempt(config);
      return retryConfig.shouldRetry(error, attempt);
    }

    // Network errors are always retryable
    if (error.isNetworkError) {
      return true;
    }

    // Check status code
    const retryableStatusCodes = retryConfig.retryableStatusCodes ?? DEFAULT_RETRYABLE_STATUS_CODES;
    return error.status !== undefined && retryableStatusCodes.includes(error.status);
  }

  /**
   * Get current retry attempt for a config
   */
  #getAttempt(config: RequestConfig): number {
    return this.#retryAttempts.get(config) ?? 0;
  }

  /**
   * Calculate delay based on backoff strategy
   */
  #calculateDelay(attempt: number, config: RetryConfig): number {
    let delay: number;

    if (config.backoff === 'exponential') {
      delay = config.delay * Math.pow(2, attempt);
    } else {
      delay = config.delay * (attempt + 1);
    }

    // Apply max delay
    if (config.maxDelay) {
      delay = Math.min(delay, config.maxDelay);
    }

    // Add jitter (±20%)
    const jitter = delay * 0.2 * (Math.random() - 0.5);
    return Math.max(0, delay + jitter);
  }

  /**
   * Sleep for specified milliseconds
   */
  #sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
