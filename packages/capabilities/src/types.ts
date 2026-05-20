/**
 * Core types for the Brika capability system.
 *
 * A capability is a *typed* operation a plugin may perform against the hub.
 * It carries its own Zod schemas for args and result, an optional permission
 * gate with a per-grant scope, and a handler the hub runs when a plugin
 * invokes it through `ctx.<id>(args)`.
 *
 * One primitive — `defineCapability` — replaces the previous bridge surface
 * (22 hand-rolled methods across 8 domain modules). Adding a new capability
 * is one file; the SDK ctx, the hub dispatcher, the manifest schema, and the
 * permission UI all read from the same registry.
 */

import type { z } from 'zod';

/** Capability identifier — dotted-path naming reflects nesting on `ctx`. */
export type CapabilityId = `${string}.${string}` | string;

/**
 * Scope schema attached to a permission. The user grants a capability with a
 * value matching this schema; the hub validates it at grant time and passes
 * the parsed value into the handler.
 *
 * Examples:
 *   - `z.object({ allow: z.array(z.string()) })` for net host allowlists
 *   - `z.object({ namespaces: z.array(z.string()) })` for scoped secrets
 *   - `z.void()` for an always-on grant with no parameters
 */
export interface PermissionGate<S extends z.ZodType = z.ZodType> {
  /** Human-readable permission group (`net`, `secrets`, `fs`, `exec`, …). */
  readonly name: string;
  /** Zod schema for the per-grant scope value. */
  readonly scope: S;
  /** Default scope when manifest declares the permission without a value. */
  readonly defaultScope?: z.infer<S>;
  /** Icon hint for the permission UI (Lucide icon name). */
  readonly icon?: string;
}

/**
 * Specification of a capability — the wire shape + permission gate.
 *
 * @typeParam I - Zod schema for the args sent over the wire
 * @typeParam O - Zod schema for the result sent back
 * @typeParam S - Zod schema for the permission scope (defaults to void)
 */
export interface CapabilitySpec<
  I extends z.ZodType = z.ZodType,
  O extends z.ZodType = z.ZodType,
  S extends z.ZodType = z.ZodType,
> {
  readonly id: CapabilityId;
  readonly args: I;
  readonly result: O;
  /**
   * Permission gate. Omit for always-on capabilities the hub vends to every
   * plugin unconditionally (e.g. logging, manifest reads).
   */
  readonly permission?: PermissionGate<S>;
  /** Short human-readable description shown in the permission UI. */
  readonly description?: string;
}

/**
 * Context passed to a capability handler. Carries the plugin identity and
 * the parsed scope so handlers don't need to re-query the hub for grant
 * state.
 */
export interface CapabilityHandlerContext<S = unknown> {
  /** Plugin's unique identifier (stable across restarts). */
  readonly pluginUid: string;
  /** Filesystem root the plugin was loaded from. */
  readonly pluginRoot: string;
  /**
   * Validated scope for this capability's grant — typed as `unknown` here
   * because the registry erases the spec generics at dispatch time; the
   * handler casts via its known schema when needed.
   */
  readonly grantedScope: S;
  /** Hub-side logger scoped to the plugin. */
  readonly log: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void;
}

/** Async function invoked by the hub when a plugin calls a capability. */
export type CapabilityHandler<
  I extends z.ZodType = z.ZodType,
  O extends z.ZodType = z.ZodType,
  S extends z.ZodType = z.ZodType,
> = (
  ctx: CapabilityHandlerContext<z.infer<S>>,
  args: z.infer<I>
) => Promise<z.infer<O>> | z.infer<O>;

/** A registered capability — pairs the spec with its handler. */
export interface Capability<
  I extends z.ZodType = z.ZodType,
  O extends z.ZodType = z.ZodType,
  S extends z.ZodType = z.ZodType,
> {
  readonly spec: CapabilitySpec<I, O, S>;
  readonly handler: CapabilityHandler<I, O, S>;
}

/**
 * Single entry in a plugin's capability vector — what the plugin has been
 * granted at spawn time. `scope` is the parsed-and-validated grant value.
 */
export interface CapabilityGrant {
  readonly id: CapabilityId;
  readonly scope?: unknown;
}

/**
 * The capability vector — the full set of capabilities a plugin process has
 * for its lifetime. Injected as a frozen object on `globalThis.__brika_caps`
 * by the prelude.
 */
export interface CapabilityVector {
  readonly grants: ReadonlyArray<CapabilityGrant>;
}
