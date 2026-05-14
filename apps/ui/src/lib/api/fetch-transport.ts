import type { Transport } from './transport';

/**
 * Transport that just defers to `globalThis.fetch`. The existing behavior — used
 * when the UI is loaded from the hub itself or proxied through Vite dev.
 */
export class FetchTransport implements Transport {
  readonly kind = 'fetch' as const;

  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    return globalThis.fetch(input, {
      credentials: 'include',
      ...init,
    });
  }

  close(): void {
    // nothing to close
  }
}
