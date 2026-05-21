import type { FixEntry, ValidationIssue } from '../types';
import {
  getLocales,
  getNestedStoreValue,
  removeFromI18nextStore,
  updateI18nextStore,
} from './i18next-store';

/**
 * Find a translation value for `(namespace, key)` to seed a missing entry.
 * Reference locale is tried first (display-language convenience), but under
 * union semantics the key may only exist in some other locale — fall back to
 * any locale that has it before giving up.
 */
function findSeedValue(
  namespace: string,
  key: string,
  referenceLocale: string
): string | undefined {
  const refValue = getNestedStoreValue(referenceLocale, namespace, key);
  if (typeof refValue === 'string') {
    return refValue;
  }
  for (const locale of getLocales()) {
    if (locale === referenceLocale) {
      continue;
    }
    const candidate = getNestedStoreValue(locale, namespace, key);
    if (typeof candidate === 'string') {
      return candidate;
    }
  }
  return undefined;
}

export function buildFix(issue: ValidationIssue): FixEntry | null {
  if (!issue.key) {
    return null;
  }
  switch (issue.type) {
    case 'missing-key':
    case 'missing-variable': {
      const seed = findSeedValue(issue.namespace, issue.key, issue.referenceLocale);
      if (seed === undefined) {
        return null;
      }
      return {
        type: 'set',
        locale: issue.locale,
        namespace: issue.namespace,
        key: issue.key,
        value: seed,
      };
    }
    default:
      return null;
  }
}

/**
 * POST a single fix to the dev server's `/__i18n-write` endpoint. The server
 * routes to the local filesystem or the hub based on its `localesDir`/`apiUrl`
 * configuration — neither is the overlay's concern.
 *
 * Failures are logged to the console; the in-store mutation is also applied
 * immediately so the UI stays responsive. Without an in-flight reconciler
 * the overlay's state could diverge from disk on transient errors, but for
 * a single-user dev session that's a known acceptable trade.
 */
async function postFix(fix: FixEntry): Promise<void> {
  const body = JSON.stringify({
    locale: fix.locale,
    namespace: fix.namespace,
    key: fix.key,
    value: fix.type === 'set' ? (fix.value ?? '') : '',
  });
  try {
    const res = await fetch('/__i18n-write', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(
        `[i18n-dev] fix failed (${fix.namespace}:${fix.key} [${fix.locale}]): HTTP ${res.status}${detail ? ` — ${detail}` : ''}`
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[i18n-dev] fix failed (${fix.namespace}:${fix.key} [${fix.locale}]): ${message}`
    );
  }
}

export function sendFixes(fixes: FixEntry[]) {
  if (fixes.length === 0) {
    return;
  }
  for (const fix of fixes) {
    if (fix.type === 'set' && fix.value !== undefined) {
      updateI18nextStore(fix.locale, fix.namespace, fix.key, fix.value);
    } else if (fix.type === 'delete') {
      removeFromI18nextStore(fix.locale, fix.namespace, fix.key);
    }
    void postFix(fix);
  }
}

export function fixIssue(issue: ValidationIssue) {
  const fix = buildFix(issue);
  if (fix) {
    sendFixes([fix]);
  }
}

export function fixAllIssues(issues: ValidationIssue[]) {
  const fixes = issues.map(buildFix).filter((f): f is FixEntry => f !== null);
  sendFixes(fixes);
}
