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

  // -- System --
  start(): void;
  log(level: LogLevel, message: string, meta?: Record<string, Json>): void;

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
    provider: () => PreferenceOption[] | Promise<PreferenceOption[]>
  ): void;

  // -- Actions --
  registerAction(id: string, handler: (input?: Json) => Json | Promise<Json>): void;

  // -- Routes --
  registerRoute(
    method: RouteMethod,
    path: string,
    handler: (req: RouteRequest) => RouteResponse | Promise<RouteResponse>
  ): void;

  // -- Blocks (manifest-validated, instance lifecycle) --
  registerBlock(block: {
    id: string;
    inputs: Array<{ id: string; typeName: string; type?: unknown; jsonSchema?: unknown }>;
    outputs: Array<{ id: string; typeName: string; type?: unknown; jsonSchema?: unknown }>;
    schema: unknown;
    start?: (ctx: {
      blockId: string;
      workflowId: string;
      config: Record<string, unknown>;
      emit(portId: string, data: unknown): void;
    }) => { pushInput(portId: string, data: unknown): void; stop(): void };
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
}

// ---- Global declaration ----

declare global {
  var __brika_ipc: PreludeBridge | undefined;
}
