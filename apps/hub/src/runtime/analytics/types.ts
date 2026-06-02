import type { Json } from '@/types';

/**
 * Where a captured feature-usage event originated. Mirrors the architecture
 * boundaries: the hub itself, a sandboxed plugin (via SDK/IPC), the web UI
 * (via HTTP), or the CLI.
 */
export type CaptureSource = 'hub' | 'plugin' | 'ui' | 'cli';

/** All capture sources as a constant array (filter dropdowns, validation). */
export const CAPTURE_SOURCES: CaptureSource[] = ['hub', 'plugin', 'ui', 'cli'];

/**
 * A single product-analytics event — "feature X was used". `name` is a
 * dotted key like `workflow.created` or `page.viewed`; `props` is optional
 * structured context. Deliberately small and privacy-light: no PII is
 * implied, and remote forwarding is opt-in (see {@link EventForwarder}).
 */
export interface CaptureEvent {
  ts: number;
  name: string;
  source: CaptureSource;
  /** Optional anonymous actor/session id, set by the caller when relevant. */
  distinctId?: string;
  /** Set when {@link source} is `plugin`. */
  pluginName?: string;
  props?: Record<string, Json>;
}
