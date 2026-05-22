/**
 * Core types for the Brika grant system.
 *
 * A "grant" is a typed operation the hub vends to a plugin. It carries its
 * own Zod schemas for args, result, and (optional) per-grant scope, plus a
 * handler the hub runs when a plugin invokes it through `ctx.<id>(args)`.
 *
 * The single primitive `defineGrant` replaces the previous bridge surface
 * (22 hand-rolled methods across 8 domain modules). Adding a new grant is
 * one file; the SDK `ctx`, the hub dispatcher, the manifest schema, and the
 * permission UI all read from the same registry.
 */

import type { z } from 'zod';

/**
 * Grant identifier — reverse-DNS unique name.
 *
 * Brika built-ins follow `dev.brika.<family>.<verb>` (e.g.
 * `dev.brika.net.fetch`); third-party grants use their own DNS prefix
 * (e.g. `com.acme.weather.scrape`). The string type is intentionally wide:
 * a template-literal type would block valid namespaces that don't fit
 * `a.b.c.d`; the registry validates format at registration time.
 */
export type GrantId = string;

/**
 * Permission gate attached to a grant. The user permits a grant with a
 * scope value matching the schema; the hub validates it at consent time
 * and again at dispatch (defensive re-parse — see registry.ts).
 *
 * Examples:
 *   - `z.object({ allow: z.array(z.string()) })` for net host allow-lists
 *   - `z.object({ namespaces: z.array(z.string()) })` for scoped secrets
 *   - `z.object({})` for an always-on permitted grant with no parameters
 */
export interface PermissionGate<S extends z.ZodType = z.ZodType> {
  /** Human-readable permission family (`net`, `secrets`, `fs`, …). */
  readonly name: string;
  /** Zod schema for the per-permit scope value. */
  readonly scope: S;
  /** Default scope when manifest declares the permission without a value. */
  readonly defaultScope?: z.infer<S>;
  /** Icon hint for the permission UI (Lucide icon name). */
  readonly icon?: string;
}

/**
 * Specification of a grant — the wire shape + permission gate.
 */
export interface GrantSpec<
  I extends z.ZodType = z.ZodType,
  O extends z.ZodType = z.ZodType,
  S extends z.ZodType = z.ZodType,
> {
  /**
   * Reverse-DNS unique identifier — namespaced across the whole ecosystem.
   *
   * Brika built-ins use `dev.brika.<family>.<verb>` (e.g. `dev.brika.net.fetch`).
   * Third-party plugins use their own DNS (e.g. `com.acme.weather.scrape`).
   * This is what travels over the wire and what is stored in permitted state.
   */
  readonly id: GrantId;
  /**
   * Dotted property path under `ctx` plugin code uses to invoke this grant.
   * Defaults to the id with the first two segments stripped (so
   * `dev.brika.net.fetch` → `net.fetch`). Override when the default would
   * collide with another permitted grant, or to expose under a
   * vendor-specific subtree.
   */
  readonly ctxPath?: string;
  readonly args: I;
  readonly result: O;
  /**
   * Permission gate. Omit for always-on grants the hub vends to every
   * plugin unconditionally (e.g. logging, manifest reads).
   */
  readonly permission?: PermissionGate<S>;
  /** Short human-readable description shown in the permission UI. */
  readonly description?: string;
}

/**
 * Context passed to a grant handler. Carries the plugin identity and the
 * parsed scope so handlers don't need to re-query the hub for permit state.
 *
 * `signal` is a hub-side AbortSignal (see watchdog in the plan). Handlers
 * SHOULD honour it (pass to fetch, child-process spawns, etc.) so a stuck
 * handler can be terminated cleanly.
 */
export interface GrantHandlerContext<S = unknown> {
  /** Plugin's unique identifier (stable across restarts). */
  readonly pluginUid: string;
  /** Filesystem root the plugin was loaded from. */
  readonly pluginRoot: string;
  /**
   * Validated scope for this grant's permit. The registry guarantees this
   * matches `spec.permission.scope` via Zod parse at dispatch time — no
   * `as` cast required inside the handler.
   */
  readonly grantedScope: S;
  /** Hub-side logger scoped to the plugin. */
  readonly log: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void;
  /** Hub-side watchdog signal. Aborts on timeout, shutdown, or revocation. */
  readonly signal: AbortSignal;
}

/** Async function invoked by the hub when a plugin calls a grant. */
export type GrantHandler<
  I extends z.ZodType = z.ZodType,
  O extends z.ZodType = z.ZodType,
  S extends z.ZodType = z.ZodType,
> = (ctx: GrantHandlerContext<z.infer<S>>, args: z.infer<I>) => Promise<z.infer<O>> | z.infer<O>;

/** A registered grant — pairs the spec with its handler. */
export interface Grant<
  I extends z.ZodType = z.ZodType,
  O extends z.ZodType = z.ZodType,
  S extends z.ZodType = z.ZodType,
> {
  readonly spec: GrantSpec<I, O, S>;
  readonly handler: GrantHandler<I, O, S>;
}

/**
 * Single entry in a plugin's vector — what the plugin has been permitted at
 * spawn time. `scope` is the parsed and validated permit value; `ctxPath`
 * is the dotted name plugin code uses under `ctx`.
 */
export interface GrantEntry {
  readonly id: GrantId;
  readonly ctxPath: string;
  readonly scope?: unknown;
}

/**
 * The grant vector — the full set of operations a plugin process is
 * permitted for its lifetime. Injected as a frozen branded object on
 * `globalThis.__brika_grants` by the prelude.
 */
export interface GrantVector {
  readonly grants: ReadonlyArray<GrantEntry>;
}

/**
 * A plugin's manifest declares which grants it wants and, for each, an
 * optional scope value matching the spec's scope schema.
 */
export interface ManifestGrantRequest {
  /** Desired scope — Zod-validated against the spec at vector-build time. */
  readonly scope?: unknown;
}

export type ManifestGrants = Readonly<Record<GrantId, ManifestGrantRequest>>;

/**
 * User-permitted grants (from the permission UI). Maps grant id to the
 * permitted scope. A grant missing from this map is denied — even if the
 * manifest requests it.
 */
export type UserGrants = Readonly<Record<GrantId, unknown>>;
