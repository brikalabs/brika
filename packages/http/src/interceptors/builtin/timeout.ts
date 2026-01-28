/**
 * Timeout interceptor for request timeout handling
 */

import type { RequestConfig } from '../../types';
import { createTimeoutError } from '../../utils/errors';
import type { RequestInterceptor } from '../types';

/**
 * Timeout interceptor using AbortController
 */
export class TimeoutInterceptor implements RequestInterceptor {
  readonly #controllers = new WeakMap<RequestConfig, AbortController>();

  constructor(private readonly defaultTimeout?: number) {}

  onRequest(config: RequestConfig): RequestConfig {
    const timeout = config.timeout ?? this.defaultTimeout;

    if (!timeout) {
      return config;
    }

    // Create AbortController for timeout
    const controller = new AbortController();
    this.#controllers.set(config, controller);

    // Set timeout
    const timeoutId = setTimeout(() => {
      controller.abort(createTimeoutError(timeout, config));
    }, timeout);

    // Combine with existing signal if present
    const signal = config.signal
      ? this.#combineSignals(config.signal, controller.signal)
      : controller.signal;

    // Clear timeout on abort
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeoutId);
      },
      { once: true }
    );

    return {
      ...config,
      signal,
    };
  }

  /**
   * Combine multiple abort signals
   */
  #combineSignals(signal1: AbortSignal, signal2: AbortSignal): AbortSignal {
    const controller = new AbortController();

    const onAbort = () => {
      controller.abort(signal1.aborted ? signal1.reason : signal2.reason);
    };

    signal1.addEventListener('abort', onAbort, { once: true });
    signal2.addEventListener('abort', onAbort, { once: true });

    return controller.signal;
  }
}
