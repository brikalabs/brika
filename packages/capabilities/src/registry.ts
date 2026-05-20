import { BrikaError } from '@brika/ipc';
import { z } from 'zod';
import type {
  Capability,
  CapabilityGrant,
  CapabilityHandlerContext,
  CapabilityId,
  CapabilityVector,
} from './types';

/**
 * Capability-registry-specific codes, all aliased onto the platform-wide
 * BrikaErrorCode vocabulary so a downstream catcher can match on either
 * `'NOT_REGISTERED'` (capability-specific) or `'INVALID_INPUT'` (platform).
 */
export type CapabilityErrorCode =
  | 'NOT_REGISTERED'
  | 'NOT_GRANTED'
  | 'INVALID_INPUT' // formerly 'INVALID_ARGS' — unified with BrikaErrorCode
  | 'INVALID_OUTPUT' // formerly 'INVALID_RESULT' — unified
  | 'INVALID_SCOPE'
  | 'INTERNAL'; // formerly 'HANDLER_THREW' — unified (real cause is in .cause)

/**
 * Errors thrown by the registry. Extends `BrikaError` so callers can
 * `instanceof BrikaError`-narrow uniformly and read `.code`, `.data`,
 * `.cause`. The `capabilityId` field is exposed both as a direct property
 * (back-compat with existing callers) and inside `data.capabilityId`
 * (cross-IPC accessible).
 */
export class CapabilityError extends BrikaError {
  readonly capabilityId?: CapabilityId;

  constructor(
    code: CapabilityErrorCode,
    message: string,
    capabilityId?: CapabilityId,
    cause?: unknown
  ) {
    super(code, message, {
      data: capabilityId === undefined ? undefined : { capabilityId },
      cause,
    });
    this.name = 'CapabilityError';
    this.capabilityId = capabilityId;
  }
}

/** Type-erased capability — what the registry stores internally. */
type AnyCapability = Capability<z.ZodType, z.ZodType, z.ZodType>;

/**
 * A plugin's manifest declares which capabilities it wants and, for each, an
 * optional scope value matching the capability's scope schema.
 */
export interface ManifestCapabilityRequest {
  /** The desired scope value — Zod-validated against the spec at vector build time. */
  readonly scope?: unknown;
}

export type ManifestCapabilities = Readonly<Record<CapabilityId, ManifestCapabilityRequest>>;

/**
 * User-granted capabilities (from the permission UI). Maps capability id to
 * the granted scope. A capability missing from this map is denied — even if
 * the manifest requests it.
 */
export type UserGrants = Readonly<Record<CapabilityId, unknown>>;

/**
 * Central catalog of capabilities. The hub owns one instance; the SDK does
 * not — plugin code is given a frozen vector at spawn time and never touches
 * the registry directly.
 */
export class CapabilityRegistry {
  readonly #caps = new Map<CapabilityId, AnyCapability>();

  /** Register a capability. Throws if the id is already taken. */
  register(cap: AnyCapability): void {
    if (this.#caps.has(cap.spec.id)) {
      throw new CapabilityError(
        'NOT_REGISTERED',
        `Capability already registered: ${cap.spec.id}`,
        cap.spec.id
      );
    }
    this.#caps.set(cap.spec.id, cap);
  }

  /** Look up a capability by id. Returns undefined if not registered. */
  get(id: CapabilityId): AnyCapability | undefined {
    return this.#caps.get(id);
  }

  /** List every registered capability. Order matches registration order. */
  list(): IterableIterator<AnyCapability> {
    return this.#caps.values();
  }

  /** Number of registered capabilities. */
  get size(): number {
    return this.#caps.size;
  }

  /**
   * Compute the capability vector for a plugin given its manifest and the
   * current user grants.
   *
   * The vector includes a capability iff ALL of the following hold:
   *   1. The capability is registered.
   *   2. The manifest requests it (or it has no permission gate at all).
   *   3. The user has granted it (or it has no permission gate at all).
   *
   * Scopes are validated against the spec's scope schema. The final scope is
   * the user's grant (already validated) — the manifest only declares
   * *desired* scope; the user decides what to allow.
   */
  buildVector(manifest: ManifestCapabilities, grants: UserGrants): CapabilityVector {
    const out: CapabilityGrant[] = [];

    for (const cap of this.#caps.values()) {
      const { id, permission } = cap.spec;
      const ctxPath = resolveCtxPath(cap.spec);

      if (permission === undefined) {
        // Always-on capability — vended unconditionally.
        out.push({ id, ctxPath });
        continue;
      }

      const requested = Object.hasOwn(manifest, id);
      const userGranted = Object.hasOwn(grants, id);
      if (!requested || !userGranted) {
        continue;
      }

      // The user's grant wins; validate against the spec's scope schema.
      const raw = grants[id] ?? permission.defaultScope;
      const parsed = permission.scope.safeParse(raw);
      if (!parsed.success) {
        // A bad grant in the database is operator error — skip it rather
        // than failing the entire plugin spawn. The hub should log this.
        continue;
      }
      out.push({ id, ctxPath, scope: parsed.data });
    }

    return Object.freeze({ grants: Object.freeze(out) });
  }

  /**
   * Dispatch a plugin's call to the registered handler.
   *
   * Validates args against the spec, runs the handler, validates the result,
   * and returns it. Throws `CapabilityError` on every failure mode with a
   * stable code.
   *
   * The caller must verify the capability is in the plugin's vector BEFORE
   * dispatching — this method does not re-check. (The hub plumbing layer
   * does that gate; the registry stays a pure data structure.)
   */
  async dispatch(
    id: CapabilityId,
    args: unknown,
    handlerCtx: CapabilityHandlerContext
  ): Promise<unknown> {
    const cap = this.#caps.get(id);
    if (!cap) {
      throw new CapabilityError('NOT_REGISTERED', `Capability not registered: ${id}`, id);
    }

    const parsedArgs = cap.spec.args.safeParse(args);
    if (!parsedArgs.success) {
      throw new CapabilityError(
        'INVALID_INPUT',
        `Invalid args for ${id}: ${formatZodIssue(parsedArgs.error)}`,
        id,
        parsedArgs.error
      );
    }

    let result: unknown;
    try {
      result = await cap.handler(handlerCtx, parsedArgs.data);
    } catch (e) {
      // A handler that already threw a typed BrikaError (e.g.
      // `NET_HOST_NOT_ALLOWED` from net.ts) carries its own code, data,
      // and developer hint — passing it through preserves that signal
      // for plugin code and the UI. Only unknown throws get rewrapped
      // as INTERNAL with the original attached as `cause` so the stack
      // and message still survive across IPC.
      if (e instanceof BrikaError) {
        throw e;
      }
      const message = e instanceof Error ? e.message : String(e);
      throw new CapabilityError('INTERNAL', `Handler for ${id} threw: ${message}`, id, e);
    }

    const parsedResult = cap.spec.result.safeParse(result);
    if (!parsedResult.success) {
      throw new CapabilityError(
        'INVALID_OUTPUT',
        `Handler for ${id} returned invalid result: ${formatZodIssue(parsedResult.error)}`,
        id,
        parsedResult.error
      );
    }
    return parsedResult.data;
  }
}

function formatZodIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) {
    return 'validation failed';
  }
  const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
  return `at "${path}": ${issue.message}`;
}

/**
 * Derive the dotted ctx path from a capability id.
 *
 * Convention: strip the first two reverse-DNS segments
 * (`dev.brika.net.fetch` → `net.fetch`, `com.acme.crypto.sign` →
 * `crypto.sign`). If the spec explicitly sets `ctxPath` that wins.
 *
 * Ids with fewer than three segments (e.g. legacy `net.fetch` during a
 * migration window) pass through unchanged.
 */
export function resolveCtxPath(spec: { id: string; ctxPath?: string }): string {
  if (spec.ctxPath !== undefined) {
    return spec.ctxPath;
  }
  const segments = spec.id.split('.');
  if (segments.length <= 2) {
    return spec.id;
  }
  return segments.slice(2).join('.');
}
