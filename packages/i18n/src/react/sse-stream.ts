/**
 * SSE subscription to the hub's `<apiPrefix>/events` endpoint. Each frame is
 * a JSON-encoded `RegistryChange` (validated via zod, malformed frames are
 * dropped). EventSource auto-reconnects on transient errors, but the stream
 * has no replay protocol — any registry mutations that happened between
 * disconnect and reconnect would be lost, so we force a full reload of the
 * active language on reconnect to re-sync.
 */

import { z } from 'zod';

const RegistryChangeSchema = z.object({
  kind: z.enum(['set', 'remove', 'clear']),
  namespace: z.string().nullable(),
  locale: z.string().optional(),
  source: z.string().optional(),
});

export type RegistryChange = z.infer<typeof RegistryChangeSchema>;

export interface RegistryEventStreamOptions {
  readonly apiPrefix: string;
  readonly onChange: (change: RegistryChange) => void;
  readonly onReconnect: () => void;
}

export class RegistryEventStream {
  readonly #apiPrefix: string;
  readonly #onChange: (change: RegistryChange) => void;
  readonly #onReconnect: () => void;
  #eventSource: EventSource | null = null;

  constructor(options: RegistryEventStreamOptions) {
    this.#apiPrefix = options.apiPrefix;
    this.#onChange = options.onChange;
    this.#onReconnect = options.onReconnect;
  }

  start(): void {
    if (globalThis.window === undefined || this.#eventSource) {
      return;
    }
    let droppedConnection = false;
    try {
      this.#eventSource = new EventSource(`${this.#apiPrefix}/events`);
      this.#eventSource.onmessage = (event) => {
        let payload: unknown;
        try {
          payload = JSON.parse(event.data);
        } catch {
          // ignore malformed payloads
          return;
        }
        const parsed = RegistryChangeSchema.safeParse(payload);
        if (parsed.success) {
          this.#onChange(parsed.data);
        }
      };
      this.#eventSource.onerror = () => {
        droppedConnection = true;
      };
      this.#eventSource.onopen = () => {
        if (!droppedConnection) {
          return;
        }
        droppedConnection = false;
        this.#onReconnect();
      };
    } catch {
      // SSE not supported — i18next will re-fetch if useTranslation re-runs.
    }
  }

  close(): void {
    if (!this.#eventSource) {
      return;
    }
    try {
      this.#eventSource.close();
    } catch {
      // already closed
    }
    this.#eventSource = null;
  }
}
