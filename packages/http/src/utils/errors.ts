/**
 * Error utilities for HTTP client
 */

import { HttpError, type RequestConfig, TimeoutError } from '../types';

/**
 * Create an HTTP error from a fetch response
 */
export async function createHttpError(
  response: Response,
  config?: RequestConfig
): Promise<HttpError> {
  let message = `HTTP ${response.status}: ${response.statusText}`;

  try {
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      const errorData = (await response.json()) as { message?: string; error?: unknown };
      if (errorData.message) {
        message = errorData.message;
      } else if (errorData.error) {
        message =
          typeof errorData.error === 'string' ? errorData.error : JSON.stringify(errorData.error);
      }
    } else {
      const text = await response.text();
      if (text) {
        message = text.slice(0, 200); // Limit error message length
      }
    }
  } catch {
    // Ignore parsing errors, use default message
  }

  return new HttpError(message, response.status, response, config);
}

/**
 * Create a timeout error
 */
export function createTimeoutError(timeout: number, config?: RequestConfig): TimeoutError {
  return new TimeoutError(`Request timeout after ${timeout}ms`, timeout, config);
}

/**
 * Create a network error
 */
export function createNetworkError(error: Error, config?: RequestConfig): HttpError {
  return new HttpError(`Network error: ${error.message}`, undefined, undefined, config);
}

/**
 * Check if an error is an HttpError
 */
export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

/**
 * Check if an error is a TimeoutError
 */
export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError;
}
