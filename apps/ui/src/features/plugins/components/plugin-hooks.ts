import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale as useHostLocale } from '@/lib/use-locale';
import {
  ACTION_META_HEADER,
  ActionError,
  type ActionErrorBody,
  APPLICATION_JSON,
  BRIKA_BINARY_HEADER,
  encodeActionInput,
  encodeMetaHeader,
  handleActionError,
  parseActionError,
  type UseActionOptions,
} from './action-error';
import { PluginContext } from './plugin-context';

export type { UseActionOptions } from './action-error';
export { ActionError } from './action-error';

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
      if (opts?.meta && body && contentType !== APPLICATION_JSON) {
        headers[ACTION_META_HEADER] = encodeMetaHeader(opts.meta);
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
