import { toast } from '@brika/clay';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale as useHostLocale } from '@/lib/use-locale';
import { PluginContext } from './plugin-context';

// ── Locale hook ──────────────────────────────────────────────────────────────

export function usePluginLocale() {
  const { namespace } = useContext(PluginContext);
  const { t: scopedT } = useTranslation(namespace || undefined, {
    useSuspense: false,
  });
  const { tp: _, ...locale } = useHostLocale();

  return useMemo(
    () => ({
      ...locale,
      t: (key: string, options?: Record<string, unknown>) => String(scopedT(key, options)),
    }),
    [locale, scopedT]
  );
}

// ── Action errors ────────────────────────────────────────────────────────────

interface ActionRef {
  readonly __actionId: string;
}

/**
 * Thrown / returned by the action hooks when the server returns a non-2xx
 * response. Wraps the structured envelope (`message`, `name`, `code`,
 * `data`) from the wire contract so callers can branch on `.code` —
 * e.g. `if (err.code === 'EPERM') ...`.
 */
export class ActionError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly originalName?: string;
  readonly data?: unknown;

  constructor(
    message: string,
    init: { status: number; code?: string; originalName?: string; data?: unknown }
  ) {
    super(message);
    this.name = 'ActionError';
    this.status = init.status;
    this.code = init.code;
    this.originalName = init.originalName;
    this.data = init.data;
  }

  /** Build an `ActionError` from an unknown thrown value (network failure, etc). */
  static fromUnknown(err: unknown, status = 0): ActionError {
    if (err instanceof ActionError) {
      return err;
    }
    if (err instanceof Error) {
      return new ActionError(err.message, { status, originalName: err.name });
    }
    return new ActionError(typeof err === 'string' ? err : String(err), { status });
  }
}

interface ActionErrorBody {
  error?:
    | string
    | {
        message?: string;
        name?: string;
        code?: string;
        data?: unknown;
      };
}

/** Convert a hub response body + status into a typed `ActionError`. */
function parseActionError(body: ActionErrorBody, status: number): ActionError {
  const envelope = body.error;
  if (typeof envelope === 'string') {
    return new ActionError(envelope, { status });
  }
  const message = envelope?.message ?? `Action failed (${status})`;
  return new ActionError(message, {
    status,
    code: envelope?.code,
    originalName: envelope?.name,
    data: envelope?.data,
  });
}

export interface UseActionOptions {
  /**
   * Auto-show a toast when the request fails. Default: `true`.
   * Set to `false` if the caller is rendering the error inline.
   */
  toastOnError?: boolean;
  /**
   * Custom error handler. Receives the parsed `ActionError`. Suppresses
   * the default toast unless it returns `true` to chain through.
   */
  onError?: (err: ActionError) => boolean | void;
  /**
   * JSON metadata to attach when the input is binary (Blob / File /
   * Uint8Array / ArrayBuffer). Travels in the `X-Brika-Action-Meta`
   * header; the hub merges it into the action input as
   * `{ ...meta, body: <bytes> }` before invoking the handler.
   *
   * Use this for "binary payload with a few scalar fields" actions
   * like `writeEntry({ path }, file)` — the path lands in `meta`, the
   * bytes are the raw body, no base64 anywhere.
   */
  meta?: Record<string, unknown>;
}

const ACTION_META_HEADER = 'x-brika-action-meta';

/**
 * Marker emitted by the hub on responses that carry raw binary bytes
 * (handler used `binaryResponse(...)`). The actual file MIME stays in
 * `Content-Type` so the browser uses the right viewer; this header is
 * the protocol bit — without it we'd misclassify a JSON file's bytes
 * as a JSON action result and return `undefined`.
 */
const BRIKA_BINARY_HEADER = 'x-brika-binary';

/**
 * Default toast for an `ActionError`. Title comes from the original
 * error name (or "Action failed" for generic / Brika-typed errors),
 * body from the human-readable message.
 */
function toastActionError(err: ActionError): void {
  const title =
    err.originalName === 'BrikaError' || !err.originalName ? 'Action failed' : err.originalName;
  toast.error(title, { description: err.message });
}

function handleActionError(err: ActionError, opts: UseActionOptions | undefined): void {
  let shouldToast = opts?.toastOnError !== false;
  if (opts?.onError) {
    const chain = opts.onError(err);
    if (chain !== true) {
      shouldToast = false;
    }
  }
  if (shouldToast) {
    toastActionError(err);
  }
}

// ── Action hook (auto-fetch) ─────────────────────────────────────────────────

interface UsePluginActionResult<T> {
  data: T | undefined;
  loading: boolean;
  /** The parsed `ActionError` from the last attempt, or `null` if healthy. */
  error: ActionError | null;
  refetch: () => void;
}

/**
 * Auto-fetched action: fires on mount, returns `{ data, loading, error, refetch }`.
 * On failure shows a toast by default (override via `opts.toastOnError` or `opts.onError`).
 */
export function usePluginAction<T>(
  ref: ActionRef,
  opts?: UseActionOptions
): UsePluginActionResult<T> {
  const { uid } = useContext(PluginContext);
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ActionError | null>(null);
  const counterRef = useRef(0);

  // Stabilise the callbacks via ref so changing them between renders
  // doesn't churn `execute`'s identity (and the effect that depends on it).
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const execute = useCallback(() => {
    const id = ++counterRef.current;
    setLoading(true);
    setError(null);

    fetch(`/api/plugins/${uid}/actions/${ref.__actionId}`, {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) {
          const body: ActionErrorBody = await res.json().catch(() => ({}));
          throw parseActionError(body, res.status);
        }
        const json = await res.json();
        if (counterRef.current === id) {
          setData(json.data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (counterRef.current !== id) {
          return;
        }
        const actionErr = err instanceof ActionError ? err : ActionError.fromUnknown(err);
        setError(actionErr);
        setLoading(false);
        handleActionError(actionErr, optsRef.current);
      });
  }, [uid, ref.__actionId]);

  useEffect(() => {
    execute();
  }, [execute]);

  return { data, loading, error, refetch: execute };
}

// ── Identity / URL helpers ───────────────────────────────────────────────────

/** Returns the running plugin's UID from React context. */
export function usePluginUid(): string {
  return useContext(PluginContext).uid;
}

/**
 * Builds an absolute URL to one of this plugin's routes.
 * Example: `usePluginRouteUrl('avatar.png')` → `/api/plugins/<uid>/routes/avatar.png`.
 */
export function usePluginRouteUrl(path: string): string {
  const { uid } = useContext(PluginContext);
  const clean = path.startsWith('/') ? path.slice(1) : path;
  return `/api/plugins/${uid}/routes/${clean}`;
}

// ── Action caller hook ───────────────────────────────────────────────────────

/**
 * Returns a stable callback to call a plugin action imperatively.
 *
 * By default, failures are surfaced as a toast AND re-thrown as
 * `ActionError` so the caller can still branch on `.code` if it
 * needs to. Pass `{ toastOnError: false }` (or a non-null `onError`
 * returning a falsy value) to suppress the toast.
 *
 * @example
 * ```ts
 * const call = useCallAction();             // toasts by default
 * await call(makeFolder, { path: '/data/x' });
 *
 * const silent = useCallAction({ toastOnError: false });
 * try { await silent(makeFolder, input); } catch (err) { renderInline(err); }
 * ```
 */
export function useCallAction(defaults?: UseActionOptions) {
  const { uid } = useContext(PluginContext);
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  return useCallback(
    async <O>(ref: ActionRef, input?: unknown, opts?: UseActionOptions): Promise<O> => {
      const { body, contentType } = encodeActionInput(input);
      const headers: Record<string, string> = {};
      if (contentType) {
        headers['Content-Type'] = contentType;
      }
      // Attach JSON metadata only when sending a binary body —
      // sending it alongside a JSON body would be redundant since
      // the caller can just include the field in the JSON object.
      if (opts?.meta && body && contentType !== 'application/json') {
        headers[ACTION_META_HEADER] = JSON.stringify(opts.meta);
      }
      const res = await fetch(`/api/plugins/${uid}/actions/${ref.__actionId}`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body,
      });
      if (res.ok) {
        // Discriminate on the `X-Brika-Binary` marker — Content-Type
        // alone is ambiguous (a `.json` file legitimately reports
        // `application/json`, which would collide with the JSON
        // action protocol). Marker present → return a Blob with the
        // file's real MIME from Content-Type; otherwise parse JSON.
        if (res.headers.get(BRIKA_BINARY_HEADER)) {
          return (await res.blob()) as O;
        }
        const json = await res.json();
        return json.data;
      }
      const errBody: ActionErrorBody = await res.json().catch(() => ({}));
      const err = parseActionError(errBody, res.status);
      handleActionError(err, opts ?? defaultsRef.current);
      throw err;
    },
    [uid]
  );
}

/**
 * Pick the wire encoding for an action input.
 *
 * Binary inputs (`Blob` / `File` / `Uint8Array` / `ArrayBuffer`) are
 * always sent as `application/octet-stream`, regardless of the file's
 * own MIME. The Content-Type header is the protocol channel — a
 * `.json` File reporting `application/json` would collide with the
 * JSON action protocol and the hub would try to parse the file's
 * contents as the action input. The original MIME isn't needed on
 * the wire: writeEntry stores bytes; readEntry already re-derives
 * MIME from the extension at read time.
 *
 * Plain JSON inputs go as `application/json`.
 */
function encodeActionInput(input: unknown): { body: BodyInit | undefined; contentType?: string } {
  if (input === undefined) {
    return { body: undefined };
  }
  if (input instanceof Blob) {
    return { body: input, contentType: 'application/octet-stream' };
  }
  if (input instanceof ArrayBuffer) {
    return {
      body: new Blob([input], { type: 'application/octet-stream' }),
      contentType: 'application/octet-stream',
    };
  }
  if (input instanceof Uint8Array) {
    // Narrow to a fresh ArrayBuffer-backed view so BlobPart is happy.
    const buf = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
    return {
      body: new Blob([buf as ArrayBuffer], { type: 'application/octet-stream' }),
      contentType: 'application/octet-stream',
    };
  }
  return { body: JSON.stringify(input), contentType: 'application/json' };
}
