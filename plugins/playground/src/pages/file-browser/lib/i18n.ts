/**
 * The translate function shape returned by `useLocale()` from
 * `@brika/sdk/ui-kit/hooks`. Threaded into the pure formatter helpers
 * (`format`, `summary`) so they can localise without importing React.
 */
export type Translate = (key: string, options?: Record<string, unknown>) => string;
