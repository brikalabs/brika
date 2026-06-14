/**
 * Prelude Bridge
 *
 * Defines the contract between the hub's prelude (injected via --preload)
 * and the SDK. The prelude implements this interface on globalThis.__brika_ipc;
 * the SDK reads it to delegate all IPC logic to the prelude.
 *
 * This file is self-contained: it only imports from the SDK's own types.
 * The hub prelude (which has access to @brika/ipc) implements this interface.
 */

import type { Channel } from '@brika/ipc';
import type {
  HubLocation,
  Json,
  LogLevel,
  RouteMethod,
  RouteRequest,
  RouteResponse,
  SparkEvent,
} from './types';

// ---- Brand ----

/** Unique brand stamped on the prelude bridge object. */
export const PRELUDE_BRAND: unique symbol = Symbol.for('brika.prelude');

// ---- Callback types ----

export type StopHandler = () => void | Promise<void>;

export interface PreferenceOption {
  value: string;
  label: string;
  /** Optional secondary line (e.g. a model's context window and price). */
  description?: string;
}

// ---- Manifest ----

export interface PluginManifest {
  name: string;
  version: string;
  blocks?: Array<{
    id: string;
    name: string;
    description?: string;
    category: string;
    icon?: string;
    color?: string;
  }>;
  sparks?: Array<{ id: string; name: string; description?: string }>;
  bricks?: Array<{ id: string }>;
  pages?: Array<{ id: string; icon?: string }>;
}

// ---- Bridge Interface ----

export interface PreludeBridge {
  readonly [PRELUDE_BRAND]: true;

  /**
   * Raw IPC channel the prelude built. SDK helpers (e.g. the typed `ctx`
   * Proxy in `./ctx.ts`) read this to send grant.request RPCs directly
   * instead of going through a hand-rolled per-method bridge call.
   */
  readonly channel: Channel;

  // -- System --
  start(): void | Promise<void>;
  log(level: LogLevel, message: string, meta?: Record<string, Json>): void;
  /** Capture a feature-usage / product-analytics event. */
  capture(name: string, props?: Record<string, Json>, distinctId?: string): void;

  // -- Manifest --
  getManifest(): PluginManifest;
  getPluginRootDirectory(): string;
  getPluginUid(): string | undefined;

  // -- Lifecycle --
  onInit(handler: () => void | Promise<void>): () => void;
  onStop(handler: StopHandler): () => void;
  onUninstall(handler: () => void | Promise<void>): () => void;
  getPreferences(): Record<string, unknown>;
  onPreferencesChange(handler: (prefs: Record<string, unknown>) => void): () => void;
  updatePreference(key: string, value: unknown): void;
  definePreferenceOptions(
    name: string,
    provider: (params?: Record<string, unknown>) => PreferenceOption[] | Promise<PreferenceOption[]>
  ): void;

  // -- Actions --
  registerAction(id: string, handler: (input?: Json) => Json | Promise<Json>): void;

  // -- Tools (AI-discoverable, globally addressed by id) --
  registerTool(
    tool: {
      id: string;
      description?: string;
      icon?: string;
      color?: string;
      inputSchema?: unknown;
    },
    handler: (
      args: Record<string, Json>,
      ctx: { traceId: string; source: string }
    ) => Json | Promise<Json>
  ): void;

  // -- Routes --
  registerRoute(
    method: RouteMethod,
    path: string,
    handler: (req: RouteRequest) => RouteResponse | Promise<RouteResponse>
  ): void;

  // -- Blocks (manifest-validated, instance lifecycle) --
  registerBlock(block: {
    id: string;
    inputs: Array<{ id: string; type?: unknown; jsonSchema?: unknown }>;
    outputs: Array<{ id: string; type?: unknown; jsonSchema?: unknown }>;
    schema: unknown;
    start?: (ctx: {
      blockId: string;
      workflowId: string;
      config: Record<string, unknown>;
      emit(portId: string, data: unknown): void;
      callTool(
        tool: string,
        args: Record<string, Json>
      ): Promise<{ ok: boolean; content?: string; data?: Json }>;
      listTools(): Promise<Array<{ id: string; description?: string; inputSchema?: Json }>>;
    }) => { pushInput(portId: string, data: unknown): void; stop(): void };
    /**
     * Host-scheduled trigger declaration; forwarded to the hub if present.
     * Structural mirror of `BlockTrigger` in `./blocks/types`.
     */
    trigger?: { kind: 'interval'; intervalField: string; output: string };
  }): { id: string };

  // -- Sparks (manifest-validated) --
  registerSpark(id: string, schema?: Record<string, Json>): void;
  emitSpark(sparkId: string, payload: Json): void;
  subscribeSpark(sparkType: string, handler: (event: SparkEvent) => void): () => void;

  // -- Bricks (manifest-validated) --
  registerBrickType(spec: {
    id: string;
    families: ReadonlyArray<'sm' | 'md' | 'lg'>;
    minSize?: { w: number; h: number };
    maxSize?: { w: number; h: number };
    config?: unknown[];
  }): void;
  setBrickData(brickTypeId: string, data: unknown): void;
  onBrickConfigChange(
    handler: (instanceId: string, config: Record<string, unknown>) => void
  ): () => void;

  // -- Location --
  getLocation(): Promise<HubLocation | null>;
  getTimezone(): Promise<string | null>;

  // -- Secrets (programmatic per-plugin keychain storage) --
  getSecret(key: string): Promise<string | null>;
  setSecret(key: string, value: string): Promise<void>;
  deleteSecret(key: string): Promise<boolean>;
}

// ---- Global declaration ----

declare global {
  var __brika_ipc: PreludeBridge | undefined;
}
