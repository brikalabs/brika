/**
 * Mock HTTP client for testing
 */

import { HttpClient } from '../client';
import type { HttpClientConfig, HttpResponse, RequestConfig } from '../types';

export interface RecordedRequest {
  config: RequestConfig;
  timestamp: number;
}

/**
 * Mock HTTP client that records requests
 */
export class MockHttpClient extends HttpClient {
  #requests: RecordedRequest[] = [];
  readonly #mockResponses = new Map<string, HttpResponse>();

  constructor(_config?: HttpClientConfig) {
    super();
    // Config is applied via HttpClient.create() if needed
  }

  /**
   * Override execute to record requests
   */
  override async execute<T = unknown>(config: RequestConfig): Promise<HttpResponse<T>> {
    this.#requests.push({
      config: { ...config },
      timestamp: Date.now(),
    });

    // Check for mock response
    const mockKey = this.#getMockKey(config);
    const mockResponse = this.#mockResponses.get(mockKey);

    if (mockResponse) {
      return mockResponse as HttpResponse<T>;
    }

    return await super.execute<T>(config);
  }

  /**
   * Mock a response for a specific request
   */
  mockResponse<T = unknown>(method: string, url: string, response: Partial<HttpResponse<T>>): void {
    const mockKey = `${method}:${url}`;
    this.#mockResponses.set(mockKey, response as HttpResponse);
  }

  /**
   * Get all recorded requests
   */
  getRequests(): RecordedRequest[] {
    return [...this.#requests];
  }

  /**
   * Get requests filtered by method
   */
  getRequestsByMethod(method: string): RecordedRequest[] {
    return this.#requests.filter((req) => req.config.method === method);
  }

  /**
   * Get requests filtered by URL
   */
  getRequestsByUrl(url: string): RecordedRequest[] {
    return this.#requests.filter((req) => req.config.url.includes(url));
  }

  /**
   * Get the last request
   */
  getLastRequest(): RecordedRequest | undefined {
    return this.#requests.at(-1);
  }

  /**
   * Clear recorded requests
   */
  clearRequests(): void {
    this.#requests = [];
  }

  /**
   * Clear mock responses
   */
  clearMocks(): void {
    this.#mockResponses.clear();
  }

  /**
   * Clear everything
   */
  reset(): void {
    this.clearRequests();
    this.clearMocks();
    this.clearCache();
  }

  /**
   * Get mock key for a request
   */
  #getMockKey(config: RequestConfig): string {
    return `${config.method}:${config.url}`;
  }
}

/**
 * Create a mock HTTP client
 */
export function createMockClient(config?: HttpClientConfig): MockHttpClient {
  return new MockHttpClient(config);
}
