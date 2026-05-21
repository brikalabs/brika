export type Tab = 'issues' | 'runtime' | 'coverage' | 'translations';

export interface TabDef {
  id: Tab;
  label: string;
  count?: number;
}

export function TabBar({
  tabs,
  active,
  onSelect,
}: Readonly<{
  tabs: TabDef[];
  active: Tab;
  onSelect: (tab: Tab) => void;
}>) {
  return (
    <div className="flex gap-px border-dt-border border-b bg-dt-bg-subtle px-2.5 pt-1">
      {tabs.map((t) => (
        <button
          type="button"
          key={t.id}
          onClick={() => onSelect(t.id)}
          className={`relative cursor-pointer border-none bg-transparent px-3 pt-1.5 pb-2 font-medium text-[11px] transition-colors ${
            active === t.id ? 'text-dt-text' : 'text-dt-text-3 hover:text-dt-text-2'
          }`}
        >
          <span className="flex items-center gap-1.5">
            {t.label}
            {t.count !== null && (
              <span
                className={`rounded-full px-1.5 py-px font-semibold text-[9px] ${
                  active === t.id
                    ? 'bg-indigo-500/20 text-indigo-400'
                    : 'bg-dt-bg-badge text-dt-text-3'
                }`}
              >
                {t.count}
              </span>
            )}
          </span>
          {active === t.id && (
            <span className="absolute right-0 bottom-0 left-0 h-[2px] rounded-t-full bg-indigo-400" />
          )}
        </button>
      ))}
    </div>
  );
}
