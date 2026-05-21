export function groupBy<T>(items: T[], keyFn: (item: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = keyFn(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

type StatusColor = 'emerald' | 'amber' | 'red';

const COLOR_CLASSES: Record<StatusColor, { bar: string; text: string }> = {
  emerald: { bar: 'bg-emerald-400', text: 'text-emerald-400' },
  amber: { bar: 'bg-amber-400', text: 'text-amber-400' },
  red: { bar: 'bg-red-400', text: 'text-red-400' },
};

export function coverageColor(pct: number): StatusColor {
  if (pct === 100) {
    return 'emerald';
  }
  return pct > 80 ? 'amber' : 'red';
}

export function pctColor(pct: number) {
  return COLOR_CLASSES[coverageColor(pct)];
}
