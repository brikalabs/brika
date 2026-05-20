import { z } from 'zod';
import type {
  Capability,
  CapabilityGrant,
  CapabilityHandlerContext,
  CapabilityId,
  CapabilityVector,
} from './types';

/**
 * Errors thrown from the registry have stable codes so callers can map them
 * to user-facing messages without string-matching.
 */
export class CapabilityError extends Error {
  constructor(
    readonly code:
      | 'NOT_REGISTERED'
      | 'NOT_GRANTED'
      | 'INVALID_ARGS'
      | 'INVALID_RESULT'
      | 'INVALID_SCOPE'
      | 'HANDLER_THREW',
    message: string,
    readonly capabilityId?: CapabilityId
  ) {
    super(message);
    this.name = 'CapabilityError';
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

      if (permission === undefined) {
        // Always-on capability — vended unconditionally.
        out.push({ id });
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
      out.push({ id, scope: parsed.data });
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
        'INVALID_ARGS',
        `Invalid args for ${id}: ${formatZodIssue(parsedArgs.error)}`,
        id
      );
    }

    let result: unknown;
    try {
      result = await cap.handler(handlerCtx, parsedArgs.data);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new CapabilityError('HANDLER_THREW', `Handler for ${id} threw: ${message}`, id);
    }

    const parsedResult = cap.spec.result.safeParse(result);
    if (!parsedResult.success) {
      throw new CapabilityError(
        'INVALID_RESULT',
        `Handler for ${id} returned invalid result: ${formatZodIssue(parsedResult.error)}`,
        id
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
