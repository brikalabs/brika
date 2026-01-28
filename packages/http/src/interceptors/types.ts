/**
 * Interceptor types and interfaces
 */

import type { HttpError, HttpResponse, RequestConfig } from '../types';

/**
 * Request interceptor interface
 */
export interface RequestInterceptor {
  /**
   * Intercept and potentially modify a request before it's sent
   */
  onRequest(config: RequestConfig): RequestConfig | Promise<RequestConfig>;
}

/**
 * Response interceptor interface
 */
export interface ResponseInterceptor {
  /**
   * Intercept and potentially modify a response after it's received
   */
  onResponse<T = unknown>(response: HttpResponse<T>): HttpResponse<T> | Promise<HttpResponse<T>>;
}

/**
 * Error interceptor interface
 */
export interface ErrorInterceptor {
  /**
   * Intercept and potentially recover from errors
   */
  onError(error: HttpError, config: RequestConfig): Promise<HttpResponse> | Promise<never>;
}

/**
 * Combined interceptor interface
 */
export interface Interceptor
  extends Partial<RequestInterceptor>,
    Partial<ResponseInterceptor>,
    Partial<ErrorInterceptor> {}
