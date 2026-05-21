import { ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToggleSet } from './hooks';
import { groupBy } from './helpers';
import { KeyUsageBadge } from './key-usage';
import { buildMultiLocaleKeys } from './multi-locale';
import { CopyButton, EmptyState, FilterPill, NamespaceGroup } from './primitives';
import {
  getNestedStoreValue,
  removeFromI18nextStore,
  updateI18nextStore,
} from './store';
import { TranslationKeyExpanded } from './translation-row';

// Re-export so callers that pulled symbols from `./translations-tab` keep working.
export { buildMultiLocaleKeys } from './multi-locale';
export { KeyUsageBadge, KeyUsageList } from './key-usage';
export { TranslationKeyExpanded, TranslationLocaleValue } from './translation-row';

interface EditTarget {
  id: string;
  locale: string;
}

/**
 * Optimistic save: render the new value immediately and revert if the HTTP
 * round-trip fails (auth, disabled gate, unsafe key path). Browser-side fetch
 * so the user's session cookie travels with the request — the Vite dev server
 * proxies `/api/*` to the hub on the same origin.
 */
function saveTranslationToServer(
  locale: string,
  ns: string,
  key: string,
  value: string,
  bump: () => void
): Promise<void> {
  const previous = getNestedStoreValue(locale, ns, key);
  updateI18nextStore(locale, ns, key, value);
  bump();

  const rollback = () => {
    if (previous === undefined) {
      removeFromI18nextStore(locale, ns, key);
    } else {
      updateI18nextStore(locale, ns, key, previous);
    }
    bump();
  };

  return fetch(`/api/i18n/sources/${encodeURIComponent(ns)}/${encodeURIComponent(locale)}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  })
    .then(async (res) => {
      if (res.ok) {
        return;
      }
      const detail = await res.text().catch(() => '');
      const suffix = detail ? ` — ${detail}` : '';
      throw new Error(`HTTP ${res.status}${suffix}`);
    })
    .catch((err: unknown) => {
      rollback();
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[i18n-dev] save failed (${ns}:${key} [${locale}]): ${message}`);
    });
}

export function TranslationsContent({
  filter,
  locales,
  navigateTarget,
}: Readonly<{
  filter: string;
  locales: string[];
  navigateTarget: string | null;
}>) {
  const { set: collapsed, toggle: toggleNs, remove: removeCollapsed } = useToggleSet();
  const { set: expanded, toggle: toggleKey, add: addExpanded } = useToggleSet();
  const [missingOnly, setMissingOnly] = useState(false);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editVal, setEditVal] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const editRef = useRef<HTMLInputElement>(null);

  const localeKey = locales.join(',');
  const keys = useMemo(
    () => buildMultiLocaleKeys(locales),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [localeKey, refreshKey]
  );

  // Auto-expand namespace + key when navigating from highlighted text
  useEffect(() => {
    if (!navigateTarget) {
      return;
    }
    const colonIdx = navigateTarget.indexOf(':');
    if (colonIdx >= 0) {
      removeCollapsed(navigateTarget.slice(0, colonIdx));
    }
    addExpanded(navigateTarget);
  }, [navigateTarget, removeCollapsed, addExpanded]);

  const filtered = useMemo(() => {
    let result = keys;
    if (missingOnly) {
      result = result.filter((k) => k.missingCount > 0);
    }
    if (navigateTarget) {
      result = result.filter((k) => `${k.ns}:${k.key}` === navigateTarget);
    } else if (filter) {
      const q = filter.toLowerCase();
      result = result.filter(
        (k) =>
          k.key.toLowerCase().includes(q) ||
          k.ns.toLowerCase().includes(q) ||
          `${k.ns}:${k.key}`.toLowerCase().includes(q)
      );
    }
    return result;
  }, [keys, filter, navigateTarget, missingOnly]);

  const grouped = useMemo(() => groupBy(filtered, (k) => k.ns), [filtered]);
  const missingTotal = useMemo(() => keys.filter((k) => k.missingCount > 0).length, [keys]);

  useEffect(() => {
    if (editRef.current) {
      editRef.current.focus();
      editRef.current.setSelectionRange(editRef.current.value.length, editRef.current.value.length);
    }
  }, [editTarget]);

  const saveTranslation = useCallback(
    async (locale: string, ns: string, key: string, value: string) => {
      setEditTarget(null);
      await saveTranslationToServer(locale, ns, key, value, () => setRefreshKey((k) => k + 1));
    },
    []
  );

  if (grouped.length === 0) {
    return (
      <EmptyState
        title={filter || missingOnly ? 'No matching translations' : 'No translations loaded'}
        description={
          filter || missingOnly
            ? undefined
            : 'Translations will appear once i18next loads the resource bundles.'
        }
      />
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center gap-1.5">
        <FilterPill active={!missingOnly} onClick={() => setMissingOnly(false)}>
          All ({keys.length})
        </FilterPill>
        <FilterPill active={missingOnly} onClick={() => setMissingOnly(true)} variant="error">
          Missing ({missingTotal})
        </FilterPill>
      </div>

      {grouped.map(([ns, nsKeys]) => (
        <NamespaceGroup
          key={ns}
          ns={ns}
          count={nsKeys.length}
          isCollapsed={collapsed.has(ns)}
          onToggle={() => toggleNs(ns)}
        >
          {nsKeys.map((entry) => {
            const eId = `${entry.ns}:${entry.key}`;
            const isExpanded = expanded.has(eId);
            return (
              <div key={eId} className="border-dt-border-dim border-b">
                <div className="flex w-full items-center gap-1.5 px-4 py-1.5 text-[11px] transition-colors hover:bg-dt-bg-hover">
                  <button
                    type="button"
                    onClick={() => toggleKey(eId)}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 border-none bg-transparent text-left"
                  >
                    <ChevronRight
                      className={`size-2.5 shrink-0 text-dt-text-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    />
                    <span className="min-w-0 flex-1 truncate font-mono text-dt-text-2" title={eId}>
                      {entry.key}
                    </span>
                  </button>
                  <CopyButton text={eId} />
                  <KeyUsageBadge qualifiedKey={eId} />
                  {entry.missingCount > 0 && (
                    <span className="rounded-full bg-red-500/15 px-1.5 py-px font-semibold text-[9px] text-red-400">
                      {entry.missingCount} missing
                    </span>
                  )}
                </div>
                {isExpanded && (
                  <TranslationKeyExpanded
                    entry={entry}
                    eId={eId}
                    locales={locales}
                    editTarget={editTarget}
                    editRef={editRef}
                    editVal={editVal}
                    onEditChange={setEditVal}
                    onSave={saveTranslation}
                    onCancelEdit={() => setEditTarget(null)}
                    onStartEdit={setEditTarget}
                    onEditValChange={setEditVal}
                  />
                )}
              </div>
            );
          })}
        </NamespaceGroup>
      ))}
      <div className="pt-2 text-center text-[10px] text-dt-text-3">
        {filtered.length} key{filtered.length === 1 ? '' : 's'} across {locales.length} locale
        {locales.length === 1 ? '' : 's'}
      </div>
    </>
  );
}
