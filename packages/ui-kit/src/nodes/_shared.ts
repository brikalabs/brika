/** Base fields shared by all component nodes */
export interface BaseNode {
  type: string;
}

// ── Marker type guard ────────────────────────────────────────────────────────

function isMarker<T>(brand: string) {
  return (v: unknown): v is T =>
    v != null && typeof v === 'object' && (v as Record<string, unknown>)[brand] === true;
}

// ── I18n Reference ───────────────────────────────────────────────────────────

export const i18nRef = (ns: string, key: string, params?: Record<string, string | number>) =>
  ({ __i18n: true as const, ns, key, params });

export type I18nRef = Readonly<ReturnType<typeof i18nRef>>;
export const isI18nRef = isMarker<I18nRef>('__i18n');

// ── Intl Reference ───────────────────────────────────────────────────────────

export const intlRef = {
  dateTime: (value: number, options?: Intl.DateTimeFormatOptions) =>
    ({ __intl: true as const, type: 'dateTime' as const, value, options }),
  number: (value: number, options?: Intl.NumberFormatOptions) =>
    ({ __intl: true as const, type: 'number' as const, value, options }),
  relativeTime: (value: number, unit: Intl.RelativeTimeFormatUnit) =>
    ({ __intl: true as const, type: 'relativeTime' as const, value, unit }),
  list: (value: string[], options?: Intl.ListFormatOptions) =>
    ({ __intl: true as const, type: 'list' as const, value, options }),
};

export type IntlRef = { [K in keyof typeof intlRef]: Readonly<ReturnType<typeof intlRef[K]>> }[keyof typeof intlRef];
export const isIntlRef = isMarker<IntlRef>('__intl');

export function resolveIntlRef(ref: IntlRef, locale?: string): string {
  if (!locale) return ref.type === 'list' ? ref.value.join(', ') : String(ref.value);
  switch (ref.type) {
    case 'dateTime': return new Intl.DateTimeFormat(locale, ref.options).format(ref.value);
    case 'number': return new Intl.NumberFormat(locale, ref.options).format(ref.value);
    case 'relativeTime': return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(ref.value, ref.unit);
    case 'list': return new Intl.ListFormat(locale, ref.options ?? { style: 'long', type: 'conjunction' }).format(ref.value);
  }
}

export type TextContent = string | I18nRef | IntlRef;

// ── Auto-action registration ─────────────────────────────────────────────────

export type ActionHandler = (payload?: Record<string, unknown>) => void;

let _registrar: ((handler: ActionHandler) => string) | null = null;
let _fallbackIdx = 0;

export function _setActionRegistrar(fn: ((handler: ActionHandler) => string) | null): void {
  _registrar = fn;
}

export function resolveAction(handler: ActionHandler): string {
  if (_registrar) return _registrar(handler);
  return `__action_${_fallbackIdx++}`;
}

// ── Layout + Children ────────────────────────────────────────────────────────

export interface FlexLayoutProps {
  gap?: 'sm' | 'md' | 'lg';
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
  wrap?: boolean;
  grow?: boolean;
  width?: string;
  height?: string;
}

export interface NodeTypeMap {}
export type ComponentNode = NodeTypeMap[keyof NodeTypeMap];
export type Child = ComponentNode | I18nRef | IntlRef | ComponentNode[] | false | null | undefined;

export function normalizeChildren(children: Child | Child[]): ComponentNode[] {
  if (!children) return [];
  const items = Array.isArray(children) ? children.flat() : [children];
  const result: ComponentNode[] = [];
  for (const c of items) {
    if (c == null || c === false) continue;
    if (isI18nRef(c)) {
      result.push({ type: 'text', content: c.key, i18n: { ns: c.ns, key: c.key, params: c.params } } as ComponentNode);
    } else if (isIntlRef(c)) {
      result.push({ type: 'text', content: resolveIntlRef(c), intl: c } as ComponentNode);
    } else {
      result.push(c);
    }
  }
  return result;
}
