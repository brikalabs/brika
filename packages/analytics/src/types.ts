/**
 * JSON value — self-contained so the package has no host-app dependency.
 *
 * Shape-matches `@brika/ipc`'s `Json`: object members and the top-level value
 * both permit `undefined` to fit TypeScript's optional-property semantics.
 * This lets ingress paths (the hub's IPC `capture` handler, the HTTP
 * `/capture` route) pass through arbitrary JSON without a runtime cast.
 * `JSON.stringify` strips `undefined` when persisting/forwarding, so the
 * wire format is unchanged.
 */
export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json | undefined }
  | undefined;

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
  /**
   * Durable anonymous device/session id supplied by the client (the UI keeps
   * one in localStorage). Always present for UI events; never contains PII.
   */
  distinctId?: string;
  /**
   * Authenticated user id, stamped server-side from the session when the
   * caller is logged in. Local-only — it is intentionally **never** included
   * in remote forwarding (see {@link EventForwarder}).
   */
  userId?: string;
  /** Set when {@link source} is `plugin`. */
  pluginName?: string;
  props?: Record<string, Json>;
}
