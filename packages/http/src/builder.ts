/**
 * Fluent request builder for HTTP client
 */

import type {
  CacheOptions,
  HttpHeaders,
  HttpMethod,
  HttpResponse,
  QueryParams,
  RequestBody,
  RequestConfig,
  RetryConfig,
} from './types';
import { mergeHeaders } from './utils/headers';

/**
 * Fluent request builder
 */
export class RequestBuilder<T = unknown> {
  readonly #config: RequestConfig;
  readonly #executor: (config: RequestConfig) => Promise<HttpResponse<T>>;

  constructor(
    method: HttpMethod,
    url: string,
    executor: (config: RequestConfig) => Promise<HttpResponse<T>>,
    baseConfig?: Partial<RequestConfig>
  ) {
    this.#config = {
      method,
      url,
      ...baseConfig,
    };
    this.#executor = executor;
  }

  /**
   * Set query parameters
   */
  params(params: QueryParams): this {
    this.#config.params = {
      ...this.#config.params,
      ...params,
    };
    return this;
  }

  /**
   * Set request headers
   */
  headers(headers: HttpHeaders): this {
    this.#config.headers = mergeHeaders(this.#config.headers, headers);
    return this;
  }

  /**
   * Set a single header
   */
  header(key: string, value: string): this {
    this.#config.headers = mergeHeaders(this.#config.headers, {
      [key]: value,
    });
    return this;
  }

  /**
   * Set request body
   */
  body(body: RequestBody): this {
    this.#config.body = body;
    return this;
  }

  /**
   * Set request body as JSON
   */
  json(data: Record<string, unknown>): this {
    this.#config.body = data;
    this.#config.headers = mergeHeaders(this.#config.headers, {
      'Content-Type': 'application/json',
    });
    return this;
  }

  /**
   * Set request timeout
   */
  timeout(timeout: number): this {
    this.#config.timeout = timeout;
    return this;
  }

  /**
   * Set cache options
   */
  cache(options: CacheOptions | number): this {
    if (typeof options === 'number') {
      this.#config.cache = {
        ttl: options,
      };
    } else {
      this.#config.cache = options;
    }
    return this;
  }

  /**
   * Set retry configuration
   */
  retry(config: RetryConfig): this {
    this.#config.retry = config;
    return this;
  }

  /**
   * Set abort signal
   */
  signal(signal: AbortSignal): this {
    this.#config.signal = signal;
    return this;
  }

  /**
   * Set custom fetch options
   */
  fetchOptions(options: RequestInit): this {
    this.#config.fetchOptions = {
      ...this.#config.fetchOptions,
      ...options,
    };
    return this;
  }

  /**
   * Execute the request
   */
  async send(): Promise<HttpResponse<T>> {
    return await this.#executor(this.#config);
  }

  /**
   * Execute the request and return only the data
   */
  async data(): Promise<T> {
    const response = await this.send();
    return response.data;
  }

  /**
   * Get the current configuration (for testing)
   */
  getConfig(): RequestConfig {
    return {
      ...this.#config,
    };
  }
}
