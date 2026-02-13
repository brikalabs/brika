/**
 * Mock fetch utilities for testing
 */

export interface MockResponse {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  data?: unknown;
  delay?: number;
}

export interface MockMatcher {
  method?: string;
  url?: string | RegExp;
  params?: Record<string, string>;
}

/**
 * Mock fetch implementation for testing
 */
export class MockFetch {
  #mocks: Array<{ matcher: MockMatcher; response: MockResponse }> = [];
  #fallbackResponse?: MockResponse;

  /**
   * Add a mock response
   */
  mock(matcher: MockMatcher, response: MockResponse): this {
    this.#mocks.push({ matcher, response });
    return this;
  }

  /**
   * Set fallback response for unmatched requests
   */
  fallback(response: MockResponse): this {
    this.#fallbackResponse = response;
    return this;
  }

  /**
   * Get fetch function
   */
  getFetchFn() {
    return async (input: string | Request | URL, init?: RequestInit): Promise<Response> => {
      let url: string;
      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof URL) {
        url = input.toString();
      } else {
        url = input.url;
      }
      const method = init?.method ?? 'GET';

      // Find matching mock
      const mock = this.#mocks.find(({ matcher }) => this.#matches(matcher, { method, url }));

      const mockResponse = mock?.response ?? this.#fallbackResponse;

      if (!mockResponse) {
        throw new Error(`No mock found for ${method} ${url}`);
      }

      // Apply delay if specified
      if (mockResponse.delay) {
        await new Promise((resolve) => setTimeout(resolve, mockResponse.delay));
      }

      // Create Response object
      const status = mockResponse.status ?? 200;
      const statusText = mockResponse.statusText ?? 'OK';
      const headers = new Headers(mockResponse.headers ?? {});

      let body: string;

      if (mockResponse.data !== undefined) {
        if (typeof mockResponse.data === 'string') {
          body = mockResponse.data;
        } else {
          body = JSON.stringify(mockResponse.data);
          if (!headers.has('content-type')) {
            headers.set('content-type', 'application/json');
          }
        }
      } else {
        body = '';
      }

      return new Response(body, {
        status,
        statusText,
        headers,
      });
    };
  }

  /**
   * Clear all mocks
   */
  clear(): void {
    this.#mocks = [];
    this.#fallbackResponse = undefined;
  }

  /**
   * Check if request matches matcher
   */
  #matches(matcher: MockMatcher, request: { method: string; url: string }): boolean {
    if (matcher.method && matcher.method !== request.method) {
      return false;
    }

    if (matcher.url) {
      if (typeof matcher.url === 'string') {
        if (!request.url.includes(matcher.url)) {
          return false;
        }
      } else if (!matcher.url.test(request.url)) {
        return false;
      }
    }

    return true;
  }
}

/**
 * Create a mock fetch instance
 */
export function createMockFetch(): MockFetch {
  return new MockFetch();
}
