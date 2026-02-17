// Build-time: page compiler replaces with globalThis.__brika.hooks

// ─── Locale ──────────────────────────────────────────────────────────────────

export interface PluginLocale {
  t: (key: string, options?: Record<string, unknown>) => string;
  locale: string;
  changeLocale: (locale: string) => Promise<unknown>;
  formatDate: (date: Date | number, opts?: Intl.DateTimeFormatOptions) => string;
  formatTime: (date: Date | number, opts?: Intl.DateTimeFormatOptions) => string;
  formatDateTime: (date: Date | number, opts?: Intl.DateTimeFormatOptions) => string;
  formatRelativeTime: (value: number, unit: Intl.RelativeTimeFormatUnit) => string;
  formatNumber: (value: number, opts?: Intl.NumberFormatOptions) => string;
  formatCurrency: (value: number, currency: string) => string;
  formatList: (items: string[], opts?: Intl.ListFormatOptions) => string;
}

export function useLocale(): PluginLocale {
  throw new Error('useLocale() is only available in plugin pages');
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Opaque reference to a server-side action.
 * Re-exported here so page code can import from `@brika/sdk/ui-kit/hooks`.
 */
export interface ActionRef<TInput = void, TOutput = unknown> {
  readonly __actionId: string;
  readonly __phantom?: { input: TInput; output: TOutput };
}

export interface ActionResult<T> {
  /** Action data (undefined while loading or on error) */
  data: T | undefined;
  /** True during initial load or refetch */
  loading: boolean;
  /** True if the last call failed */
  error: boolean;
  /** Manually re-invoke the action */
  refetch: () => void;
}

/**
 * Call a server-side action on mount and return reactive state.
 *
 * Use for data-fetching actions (no input required).
 */
export function useAction<T>(_ref: ActionRef<void, T>): ActionResult<T> {
  throw new Error('useAction() is only available in plugin pages');
}

/**
 * Imperatively call a server-side action.
 *
 * Use for mutations (scan, commission, remove, etc.).
 */
export function callAction<I, O>(_ref: ActionRef<I, O>, _input?: I): Promise<O> {
  throw new Error('callAction() is only available in plugin pages');
}
