import type { RefObject } from 'react';
import { VariableHighlight } from './highlight';
import { KeyUsageList } from './key-usage';
import type { MultiLocaleKey } from './multi-locale';
import { getReferenceLocale } from './store';

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
  const referenceLocale = getReferenceLocale();
  return (
    <div className="space-y-0.5 bg-dt-bg-subtle px-4 py-1.5 pl-8">
      {locales.map((locale) => {
        const val = entry.values[locale];
        const isEditing = editTarget?.id === eId && editTarget.locale === locale;
        const isRef = locale === referenceLocale;
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
