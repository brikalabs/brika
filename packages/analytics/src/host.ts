import type { InjectionToken } from '@brika/di';

/**
 * Host-provided context for the analytics package. The package is otherwise
 * free of host-app internals; the host (e.g. the Brika hub) registers an
 * implementation under {@link ANALYTICS_HOST} so remote forwarding can stamp
 * an anonymous instance id, a User-Agent, and apply the host's own
 * privacy redaction to outgoing string values.
 */
export interface AnalyticsHost {
  /** Anonymous instance id included with forwarded events. */
  instanceId: string;
  /** User-Agent header for forwarding requests, e.g. `brika/0.3.1`. */
  userAgent: string;
  /** Optional redaction applied to string prop values before they leave. */
  redact?: (value: string) => string;
}

/** DI token the host registers (e.g. `container.registerInstance(...)`). */
export const ANALYTICS_HOST: InjectionToken<AnalyticsHost> = Symbol.for('brika.analytics.host');
