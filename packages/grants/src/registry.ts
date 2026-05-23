/**
 * Grant registry — the hub's catalog of every operation it vends to plugins.
 *
 * Per-plugin instance: each `PluginProcess` builds its own `GrantRegistry`
 * so handlers close over plugin-scoped state (logging, secret namespace,
 * spark subscriptions) without a session-lookup at dispatch time.
 *
 * The registry also computes the per-plugin `GrantVector` via `buildVector`,
 * intersecting:
 *   1. capabilities the hub has registered (= what the platform supports)
 *   2. capabilities the manifest requests (= what the author asked for)
 *   3. capabilities the user has permitted (= what's allowed to run)
 *
 * `dispatch` is a pure data-structure operation — it validates args, runs
 * the handler, validates result. The hub-side caller (the IPC handler in
 * `plugin-process.ts`) is responsible for the vector gate, the watchdog,
 * the quota meter, and the audit log.
 */

import { BrikaError } from '@brika/errors';
import type { z } from 'zod';
import type {
  AuditEntry,
  AuditLogger,
  Grant,
  GrantEntry,
  GrantHandlerContext,
  GrantId,
  GrantVector,
  ManifestGrants,
  UserGrants,
} from './types';

/**
 * Registry-emitted error codes. Aliased onto the platform-wide
 * `BrikaErrorCode` vocabulary so downstream catchers can match on either
 * `'NOT_REGISTERED'` (registry-specific) or `'INVALID_INPUT'` (platform).
 */
export type GrantErrorCode =
  | 'NOT_REGISTERED'
  | 'ALREADY_REGISTERED'
  | 'INVALID_INPUT'
  | 'INVALID_OUTPUT'
  | 'INVALID_SCOPE'
  | 'INTERNAL';

/**
 * Errors thrown by the registry. Extends `BrikaError` so callers can
 * `instanceof BrikaError`-narrow uniformly and read `.code`, `.data`,
 * `.cause`. `grantId` is exposed both as a direct field and inside
 * `data.grantId` so it survives the IPC wire envelope.
 */
export class GrantError extends BrikaError {
  readonly grantId?: GrantId;

  constructor(code: GrantErrorCode, message: string, grantId?: GrantId, cause?: unknown) {
    super(code, message, {
      data: grantId === undefined ? undefined : { grantId },
      cause,
    });
    this.name = 'GrantError';
    this.grantId = grantId;
  }
}

/** Type-erased grant — what the registry stores internally. */
type AnyGrant = Grant<z.ZodType, z.ZodType, z.ZodType>;

export interface GrantRegistryOptions {
  /**
   * Optional sink for per-dispatch audit entries. The hub wires this to
   * its structured log; tests pass a collecting array. Sink errors are
   * caught and discarded so observability can never break a grant call.
   */
  readonly auditLogger?: AuditLogger;
}

/**
 * Central catalog of grants. The hub owns one instance per plugin process;
 * the SDK does not — plugin code receives a frozen vector at spawn time
 * and never touches the registry directly.
 */
export class GrantRegistry {
  readonly #grants = new Map<GrantId, AnyGrant>();
  readonly #auditLogger: AuditLogger | undefined;

  constructor(opts?: GrantRegistryOptions) {
    this.#auditLogger = opts?.auditLogger;
  }

  /** Register a grant. Throws if the id is already taken. */
  register(grant: AnyGrant): void {
    if (this.#grants.has(grant.spec.id)) {
      throw new GrantError(
        'ALREADY_REGISTERED',
        `Grant already registered: ${grant.spec.id}`,
        grant.spec.id
      );
    }
    this.#grants.set(grant.spec.id, grant);
  }

  get(id: GrantId): AnyGrant | undefined {
    return this.#grants.get(id);
  }

  list(): IterableIterator<AnyGrant> {
    return this.#grants.values();
  }

  get size(): number {
    return this.#grants.size;
  }

  /**
   * Compute the grant vector for a plugin given its manifest and the
   * current user permits.
   *
   * A grant appears in the vector iff:
   *   1. it is registered AND
   *   2. it has no permission gate (always-on), OR
   *   3. the manifest requests it AND the user has permitted it.
   *
   * Scopes are validated against the spec's scope schema. The final scope
   * is the user's permit (already validated) — the manifest only declares
   * the *desired* scope; the user decides what's allowed.
   *
   * A bad permit in the database is operator error — we skip it and log
   * via the caller's logger rather than failing the entire plugin spawn.
   */
  buildVector(
    manifest: ManifestGrants,
    permits: UserGrants,
    onInvalidScope?: (id: GrantId, error: z.ZodError) => void
  ): GrantVector {
    const out: GrantEntry[] = [];

    for (const grant of this.#grants.values()) {
      const { id, permission } = grant.spec;
      const ctxPath = resolveCtxPath(grant.spec);

      if (permission === undefined) {
        out.push({ id, ctxPath });
        continue;
      }

      const requested = Object.hasOwn(manifest, id);
      const permitted = Object.hasOwn(permits, id);
      if (!requested || !permitted) {
        continue;
      }

      const raw = permits[id] ?? permission.defaultScope;
      const parsed = permission.scope.safeParse(raw);
      if (!parsed.success) {
        onInvalidScope?.(id, parsed.error);
        continue;
      }
      out.push({ id, ctxPath, scope: parsed.data });
    }

    return Object.freeze({ grants: Object.freeze(out) });
  }

  /**
   * Dispatch a plugin's call to the registered handler.
   *
   * Validates args, defensively re-parses the scope against the spec
   * (closes the UB-on-malformed-scope class), runs the handler, validates
   * the result. Throws `GrantError` with a stable code on every failure
   * mode; handler-thrown `BrikaError`s pass through unchanged so their
   * code + data round-trip across IPC.
   *
   * The caller MUST verify the grant is in the plugin's vector BEFORE
   * dispatching — this method does not re-check. (The hub plumbing layer
   * is responsible for the vector gate; the registry stays pure.)
   */
  async dispatch(id: GrantId, args: unknown, handlerCtx: GrantHandlerContext): Promise<unknown> {
    const startedAt = Date.now();
    const startTick = performance.now();
    try {
      const result = await this.#runDispatch(id, args, handlerCtx);
      this.#emitAudit({
        id,
        pluginUid: handlerCtx.pluginUid,
        startedAt,
        startTick,
        args,
        result,
      });
      return result;
    } catch (e) {
      this.#emitAudit({
        id,
        pluginUid: handlerCtx.pluginUid,
        startedAt,
        startTick,
        args,
        error: e,
      });
      throw e;
    }
  }

  async #runDispatch(
    id: GrantId,
    args: unknown,
    handlerCtx: GrantHandlerContext
  ): Promise<unknown> {
    const grant = this.#grants.get(id);
    if (!grant) {
      throw new GrantError('NOT_REGISTERED', `Grant not registered: ${id}`, id);
    }

    const parsedArgs = grant.spec.args.safeParse(args);
    if (!parsedArgs.success) {
      throw new GrantError(
        'INVALID_INPUT',
        `Invalid args for ${id}: ${formatZodIssue(parsedArgs.error)}`,
        id,
        parsedArgs.error
      );
    }

    // Defensive scope re-parse. The vector was built with `buildVector`
    // which already validated, but a long-lived process can see permit
    // edits, in-memory corruption, or version skew — never trust the
    // injected scope blindly in the handler. One Zod hop, microseconds.
    let scope: unknown = handlerCtx.grantedScope;
    if (grant.spec.permission !== undefined) {
      const parsedScope = grant.spec.permission.scope.safeParse(handlerCtx.grantedScope);
      if (!parsedScope.success) {
        throw new GrantError(
          'INVALID_SCOPE',
          `Invalid scope for ${id}: ${formatZodIssue(parsedScope.error)}`,
          id,
          parsedScope.error
        );
      }
      scope = parsedScope.data;
    }

    let result: unknown;
    try {
      result = await grant.handler(
        {
          pluginUid: handlerCtx.pluginUid,
          pluginRoot: handlerCtx.pluginRoot,
          grantedScope: scope,
          log: handlerCtx.log,
          signal: handlerCtx.signal,
        },
        parsedArgs.data
      );
    } catch (e) {
      // A handler that already threw a typed BrikaError (e.g.
      // `NET_HOST_NOT_ALLOWED`) carries its own code and data — pass
      // through. Anything else gets rewrapped as INTERNAL with the
      // original attached as `cause` so the stack survives across IPC.
      if (e instanceof BrikaError) {
        throw e;
      }
      const message = e instanceof Error ? e.message : String(e);
      throw new GrantError('INTERNAL', `Handler for ${id} threw: ${message}`, id, e);
    }

    const parsedResult = grant.spec.result.safeParse(result);
    if (!parsedResult.success) {
      throw new GrantError(
        'INVALID_OUTPUT',
        `Handler for ${id} returned invalid result: ${formatZodIssue(parsedResult.error)}`,
        id,
        parsedResult.error
      );
    }
    return parsedResult.data;
  }

  /**
   * Build and dispatch the audit entry for a single grant call. The
   * sink callback runs inside a try/catch — a misbehaving observer must
   * not crash a grant. Errors thrown from the per-grant `redact` hook
   * fall back to a coarse `'<redaction-failed>'` placeholder so the
   * entry still emits with the surrounding metadata.
   */
  #emitAudit(params: {
    id: GrantId;
    pluginUid: string;
    startedAt: number;
    startTick: number;
    args: unknown;
    result?: unknown;
    error?: unknown;
  }): void {
    if (this.#auditLogger === undefined) {
      return;
    }
    const grant = this.#grants.get(params.id);
    const redaction = grant?.spec.redact;
    const durationMs = Math.max(0, performance.now() - params.startTick);
    const safeArgs = redactValue(redaction?.args, params.args);
    const base: Omit<AuditEntry, 'result' | 'errCode'> = {
      ts: params.startedAt,
      pluginUid: params.pluginUid,
      grantId: params.id,
      args: safeArgs,
      durationMs,
    };
    const entry: AuditEntry =
      params.error === undefined
        ? { ...base, result: redactValue(redaction?.result, params.result) }
        : { ...base, errCode: extractErrCode(params.error) };
    try {
      this.#auditLogger(entry);
    } catch {
      // Observability MUST NOT break a grant call. Swallow.
    }
  }
}

function redactValue(hook: ((value: unknown) => unknown) | undefined, value: unknown): unknown {
  if (hook === undefined) {
    return value;
  }
  try {
    return hook(value);
  } catch {
    return '<redaction-failed>';
  }
}

function extractErrCode(error: unknown): string {
  if (error instanceof BrikaError) {
    return error.code;
  }
  return 'INTERNAL';
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
 * Derive the dotted `ctx` path from a grant id.
 *
 * Convention: strip the first two reverse-DNS segments
 * (`dev.brika.net.fetch` → `net.fetch`, `com.acme.crypto.sign` →
 * `crypto.sign`). An explicit `ctxPath` on the spec wins.
 *
 * Ids with fewer than three segments (legacy / migration window) pass
 * through unchanged.
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
