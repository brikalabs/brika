import { ChevronRight, FileCode } from 'lucide-react';
import type { RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HMR_SAVE } from '../hmr-events';
import { VariableHighlight } from './highlight';
import { useKeyUsage, useToggleSet } from './hooks';
import { CopyButton, EmptyState, FilterPill, NamespaceGroup, groupBy, openInEditor } from './primitives';
import { REFERENCE_LOCALE, getTranslations, updateI18nextStore } from './store';

// ─── Types ──────────────────────────────────────────────────────────────────

interface MultiLocaleKey {
  ns: string;
  key: string;
  values: Record<string, string | undefined>;
  missingCount: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function buildMultiLocaleKeys(locales: string[]): MultiLocaleKey[] {
  const refEntries = getTranslations(REFERENCE_LOCALE);
  const localeMaps = new Map<string, Map<string, string>>();
  for (const locale of locales) {
    if (locale === REFERENCE_LOCALE) {
      continue;
    }
    const map = new Map<string, string>();
    for (const entry of getTranslations(locale)) {
      map.set(`${entry.ns}:${entry.key}`, entry.value);
    }
    localeMaps.set(locale, map);
  }

  return refEntries.map((entry) => {
    const values: Record<string, string | undefined> = {};
    let missingCount = 0;
    for (const locale of locales) {
      if (locale === REFERENCE_LOCALE) {
        values[locale] = entry.value;
      } else {
        const val = localeMaps.get(locale)?.get(`${entry.ns}:${entry.key}`);
        values[locale] = val;
        if (val === undefined) {
          missingCount++;
        }
      }
    }
    return { ns: entry.ns, key: entry.key, values, missingCount };
  });
}

// ─── Components ─────────────────────────────────────────────────────────────

export function TranslationLocaleValue({
  value,
  isEditing,
  editRef,
  editVal,
  onEditChange,
  onSave,
  onCancel,
  onStartEdit,
}: Readonly<{
  value: string | undefined;
  isEditing: boolean;
  editRef: RefObject<HTMLInputElement | null>;
  editVal: string;
  onEditChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onStartEdit: () => void;
}>) {
  if (isEditing) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <input
          ref={editRef}
          className="min-w-0 flex-1 rounded border border-indigo-400/50 bg-dt-bg-raised px-1.5 py-0.5 font-mono text-[11px] text-dt-text outline-none focus:border-indigo-400"
          value={editVal}
          onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onSave();
            }
            if (e.key === 'Escape') {
              onCancel();
            }
          }}
        />
        <button
          type="button"
          onClick={onSave}
          className="shrink-0 cursor-pointer rounded border-none bg-indigo-500 px-1.5 py-0.5 font-medium text-[10px] text-white transition-colors hover:bg-indigo-600"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="shrink-0 cursor-pointer rounded border border-dt-border bg-transparent px-1.5 py-0.5 text-[10px] text-dt-text-3 transition-colors hover:text-dt-text-2"
        >
          Esc
        </button>
      </div>
    );
  }
  if (value === undefined) {
    return (
      <button
        type="button"
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded border-none bg-transparent px-1 py-0.5 text-left text-red-400/60 italic transition-colors hover:bg-dt-bg-hover hover:text-red-400"
        onClick={onStartEdit}
      >
        &mdash; missing &mdash;
      </button>
    );
  }
  return (
    <button
      type="button"
      className="min-w-0 flex-1 cursor-pointer truncate rounded border-none bg-transparent px-1 py-0.5 text-left text-dt-text-2 transition-colors hover:bg-dt-bg-hover hover:text-indigo-400"
      title="Click to edit"
      onClick={onStartEdit}
    >
      <VariableHighlight value={value} />
    </button>
  );
}

// ─── Key Usage ─────────────────────────────────────────────────────────────

export function KeyUsageList({ qualifiedKey }: Readonly<{ qualifiedKey: string }>) {
  const usages = useKeyUsage(qualifiedKey);
  const plural = usages.length === 1 ? '' : 's';
  const usageLabel = usages.length > 0
    ? `Used in ${usages.length} file${plural}`
    : 'Not found in source';
  return (
    <div className="mt-1 border-dt-border-dim border-t pt-1">
      <div className="mb-0.5 flex items-center gap-1 text-[10px] text-dt-text-4">
        <FileCode className="size-3" />
        <span>{usageLabel}</span>
      </div>
      {usages.length > 0 && (
        <div className="space-y-px">
          {usages.map((u) => (
            <button
              key={`${u.file}:${u.line}`}
              type="button"
              onClick={() => openInEditor(`${u.file}:${u.line}`)}
              className="flex w-full cursor-pointer items-center gap-1.5 truncate rounded border-none bg-transparent px-1 py-0.5 text-left font-mono text-[10px] text-dt-text-3 transition-colors hover:bg-dt-bg-hover hover:text-indigo-400"
              title={`Open ${u.file}:${u.line} in editor`}
            >
              <span className="min-w-0 flex-1 truncate">{u.file}</span>
              <span className="shrink-0 text-dt-text-4">:{u.line}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function KeyUsageBadge({ qualifiedKey }: Readonly<{ qualifiedKey: string }>) {
  const usages = useKeyUsage(qualifiedKey);
  if (usages.length === 0) {
    return null;
  }
  return (
    <span className="rounded-full bg-indigo-500/15 px-1.5 py-px font-semibold text-[9px] text-indigo-400">
      {usages.length} ref{usages.length === 1 ? '' : 's'}
    </span>
  );
}

// ─── Expanded Key ──────────────────────────────────────────────────────────

export function TranslationKeyExpanded({
  entry,
  eId,
  locales,
  editTarget,
  editRef,
  editVal,
  onEditChange,
  onSave,
  onCancelEdit,
  onStartEdit,
  onEditValChange,
}: Readonly<{
  entry: MultiLocaleKey;
  eId: string;
  locales: string[];
  editTarget: { id: string; locale: string } | null;
  editRef: RefObject<HTMLInputElement | null>;
  editVal: string;
  onEditChange: (v: string) => void;
  onSave: (locale: string, ns: string, key: string, value: string) => void;
  onCancelEdit: () => void;
  onStartEdit: (target: { id: string; locale: string }) => void;
  onEditValChange: (val: string) => void;
}>) {
  return (
    <div className="space-y-0.5 bg-dt-bg-subtle px-4 py-1.5 pl-8">
      {locales.map((locale) => {
        const val = entry.values[locale];
        const isEditing = editTarget?.id === eId && editTarget.locale === locale;
        const isRef = locale === REFERENCE_LOCALE;
        return (
          <div key={locale} className="group flex items-center gap-2 text-[11px]">
            <span
              className={`w-6 shrink-0 font-mono font-semibold text-[10px] uppercase ${
                isRef ? 'text-indigo-400' : 'text-dt-text-3'
              }`}
            >
              {locale}
            </span>
            <TranslationLocaleValue
              value={val}
              isEditing={isEditing}
              editRef={editRef}
              editVal={editVal}
              onEditChange={onEditChange}
              onSave={() => onSave(locale, entry.ns, entry.key, editVal)}
              onCancel={onCancelEdit}
              onStartEdit={() => {
                onStartEdit({ id: eId, locale });
                onEditValChange(val ?? '');
              }}
            />
          </div>
        );
      })}
      <KeyUsageList qualifiedKey={eId} />
    </div>
  );
}

// ─── Main Content ───────────────────────────────────────────────────────────

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
  const [editTarget, setEditTarget] = useState<{ id: string; locale: string } | null>(null);
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

  const saveTranslation = useCallback((locale: string, ns: string, key: string, value: string) => {
    const hot = import.meta.hot;
    if (!hot) {
      return;
    }
    hot.send(HMR_SAVE, { locale, namespace: ns, key, value });
    updateI18nextStore(locale, ns, key, value);
    setEditTarget(null);
    setRefreshKey((k) => k + 1);
  }, []);

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
                <button
                  type="button"
                  onClick={() => toggleKey(eId)}
                  className="flex w-full cursor-pointer items-center gap-1.5 border-none bg-transparent px-4 py-1.5 text-left text-[11px] transition-colors hover:bg-dt-bg-hover"
                >
                  <ChevronRight
                    className={`size-2.5 shrink-0 text-dt-text-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  />
                  <span className="min-w-0 flex-1 truncate font-mono text-dt-text-2" title={eId}>
                    {entry.key}
                  </span>
                  <CopyButton text={eId} />
                  <KeyUsageBadge qualifiedKey={eId} />
                  {entry.missingCount > 0 && (
                    <span className="rounded-full bg-red-500/15 px-1.5 py-px font-semibold text-[9px] text-red-400">
                      {entry.missingCount} missing
                    </span>
                  )}
                </button>
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
