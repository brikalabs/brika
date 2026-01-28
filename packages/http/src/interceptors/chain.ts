/**
 * Interceptor chain executor
 */

import type { HttpError, HttpResponse, RequestConfig } from '../types';
import type { ErrorInterceptor, RequestInterceptor, ResponseInterceptor } from './types';

/**
 * Interceptor chain manages request, response, and error interceptors
 */
export class InterceptorChain {
  #requestInterceptors: RequestInterceptor[] = [];
  #responseInterceptors: ResponseInterceptor[] = [];
  #errorInterceptors: ErrorInterceptor[] = [];

  /**
   * Add a request interceptor
   */
  addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.#requestInterceptors.push(interceptor);
  }

  /**
   * Add a response interceptor
   */
  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.#responseInterceptors.push(interceptor);
  }

  /**
   * Add an error interceptor
   */
  addErrorInterceptor(interceptor: ErrorInterceptor): void {
    this.#errorInterceptors.push(interceptor);
  }

  /**
   * Execute request interceptors
   */
  async executeRequest(config: RequestConfig): Promise<RequestConfig> {
    let currentConfig = config;

    for (const interceptor of this.#requestInterceptors) {
      currentConfig = await interceptor.onRequest(currentConfig);
    }

    return currentConfig;
  }

  /**
   * Execute response interceptors
   */
  async executeResponse<T = unknown>(response: HttpResponse<T>): Promise<HttpResponse<T>> {
    let currentResponse = response;

    for (const interceptor of this.#responseInterceptors) {
      currentResponse = await interceptor.onResponse(currentResponse);
    }

    return currentResponse;
  }

  /**
   * Execute error interceptors
   */
  async executeError(error: HttpError, config: RequestConfig): Promise<HttpResponse> {
    let lastError = error;

    for (const interceptor of this.#errorInterceptors) {
      try {
        return await interceptor.onError(lastError, config);
      } catch (err) {
        // If interceptor throws, pass to next interceptor
        if (err instanceof Error) {
          lastError = err as HttpError;
        }
      }
    }

    // If no interceptor handled the error, rethrow
    throw lastError;
  }

  /**
   * Clear all interceptors
   */
  clear(): void {
    this.#requestInterceptors = [];
    this.#responseInterceptors = [];
    this.#errorInterceptors = [];
  }

  /**
   * Get interceptor counts (for testing)
   */
  getCounts(): {
    request: number;
    response: number;
    error: number;
  } {
    return {
      request: this.#requestInterceptors.length,
      response: this.#responseInterceptors.length,
      error: this.#errorInterceptors.length,
    };
  }
}
