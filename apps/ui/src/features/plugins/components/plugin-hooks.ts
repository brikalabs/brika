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

// ── Action hook ──────────────────────────────────────────────────────────────

interface ActionRef {
  readonly __actionId: string;
}

export function usePluginAction<T>(ref: ActionRef): {
  data: T | undefined;
  loading: boolean;
  error: boolean;
  refetch: () => void;
} {
  const { uid } = useContext(PluginContext);
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const counterRef = useRef(0);

  const execute = useCallback(() => {
    const id = ++counterRef.current;
    setLoading(true);
    setError(false);

    fetch(`/api/plugins/${uid}/actions/${ref.__actionId}`, {
      method: 'POST',
    })
      .then((r) => {
        if (!r.ok) {
          throw r;
        }
        return r.json();
      })
      .then((json) => {
        if (counterRef.current === id) {
          setData(json.data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (counterRef.current === id) {
          setError(true);
          setLoading(false);
        }
      });
  }, [uid, ref.__actionId]);

  useEffect(() => {
    execute();
  }, [execute]);

  return {
    data,
    loading,
    error,
    refetch: execute,
  };
}

// ── Imperative action caller (non-hook) ──────────────────────────────────────

let activePluginUid = '';

export function setActivePluginUid(uid: string) {
  activePluginUid = uid;
}

export async function pluginCallAction<O>(ref: ActionRef, input?: unknown): Promise<O> {
  const res = await fetch(`/api/plugins/${activePluginUid}/actions/${ref.__actionId}`, {
    method: 'POST',
    headers:
      input === undefined
        ? {}
        : {
            'Content-Type': 'application/json',
          },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
  if (res.ok) {
    const json = await res.json();
    return json.data;
  }
  const body = await res.json().catch(() => ({}));
  throw new Error(body.error ?? `Action failed (${res.status})`);
}
