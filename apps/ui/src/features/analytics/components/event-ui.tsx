import { Badge, HoverCard, HoverCardContent, HoverCardTrigger } from '@brika/clay';
import type { Json } from '@/types';
import type { CaptureSource } from '../types';

/**
 * Per-source visual identity. A typed lookup (domain enum → presentation),
 * not a deduplicated class constant, every source needs its own dot + rail
 * colour and they must stay in sync across the table, detail sheet, and feed.
 */
export const SOURCE_STYLE: Record<CaptureSource, { dot: string; text: string; rail: string }> = {
  ui: { dot: 'bg-sky-500', text: 'text-sky-700 dark:text-sky-300', rail: 'before:bg-sky-500/70' },
  plugin: {
    dot: 'bg-violet-500',
    text: 'text-violet-700 dark:text-violet-300',
    rail: 'before:bg-violet-500/70',
  },
  hub: {
    dot: 'bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-300',
    rail: 'before:bg-emerald-500/70',
  },
  cli: {
    dot: 'bg-amber-500',
    text: 'text-amber-700 dark:text-amber-300',
    rail: 'before:bg-amber-500/70',
  },
};

/** Source tag: an outline badge with a coloured dot, scannable, not loud. */
export function SourceBadge({ source }: Readonly<{ source: CaptureSource }>) {
  const style = SOURCE_STYLE[source];
  return (
    <Badge variant="outline" className="gap-1.5 pl-1.5 font-medium">
      <span className={`size-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      <span className={style.text}>{source}</span>
    </Badge>
  );
}

/**
 * Dotted event name (`plugin.loaded`) with a de-emphasised mono namespace and
 * an emphasised action verb, so a long list aligns the eye on what happened.
 */
export function EventName({ name }: Readonly<{ name: string }>) {
  const split = name.lastIndexOf('.');
  const namespace = split === -1 ? '' : name.slice(0, split + 1);
  const action = split === -1 ? name : name.slice(split + 1);
  return (
    <span className="truncate">
      {namespace && <span className="font-mono text-muted-foreground text-xs">{namespace}</span>}
      <span className="font-medium text-foreground text-sm">{action}</span>
    </span>
  );
}

/** Render a captured prop value compactly; objects/arrays fall back to JSON. */
export function formatPropValue(value: Json): string {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return '-';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

/** A single `key: value` token. */
export function PropChip({ name, value }: Readonly<{ name: string; value: Json }>) {
  const formatted = formatPropValue(value);
  return (
    <span
      title={`${name}: ${formatted}`}
      className="inline-flex max-w-[14rem] shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs ring-1 ring-border/60 ring-inset"
    >
      <span className="text-muted-foreground">{name}</span>
      <span className="truncate text-foreground/90">{formatted}</span>
    </span>
  );
}

/** A row of prop chips, capping at `max` then revealing the rest in a HoverCard. */
export function PropsRow({
  props,
  max = 4,
}: Readonly<{ props: Record<string, Json>; max?: number }>) {
  const entries = Object.entries(props);
  if (entries.length === 0) {
    return null;
  }
  const shown = entries.slice(0, max);
  const rest = entries.slice(max);
  return (
    <div className="flex items-center gap-1 overflow-hidden">
      {shown.map(([name, value]) => (
        <PropChip key={name} name={name} value={value} />
      ))}
      {rest.length > 0 && (
        <HoverCard openDelay={120}>
          <HoverCardTrigger asChild>
            <span className="shrink-0 cursor-default rounded-md px-1.5 py-0.5 font-mono text-muted-foreground text-xs ring-1 ring-border/60 ring-inset hover:bg-muted hover:text-foreground">
              +{rest.length}
            </span>
          </HoverCardTrigger>
          <HoverCardContent className="w-80">
            <div className="flex flex-wrap gap-1">
              {rest.map(([name, value]) => (
                <PropChip key={name} name={name} value={value} />
              ))}
            </div>
          </HoverCardContent>
        </HoverCard>
      )}
    </div>
  );
}
