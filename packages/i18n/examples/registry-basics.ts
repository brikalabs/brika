/**
 * Basic usage of @brika/i18n's TranslationRegistry — no React, no i18next.
 *
 * Run with: `bun examples/registry-basics.ts`
 */

import { buildFallbackChain, TranslationRegistry } from '@brika/i18n';

// ─── Example 1: load + look up across a fallback chain ───────────────────────

const registry = new TranslationRegistry({
  defaultNamespace: 'common',
});

registry.setNamespaceLocale(
  'common',
  'en',
  {
    greeting: 'Hello {{name}}',
    buttons: { save: 'Save', cancel: 'Cancel' },
  },
  { merge: false }
);

registry.setNamespaceLocale(
  'common',
  'fr',
  {
    greeting: 'Bonjour {{name}}',
    // `buttons.cancel` is deliberately missing — falls back to EN below.
    buttons: { save: 'Enregistrer' },
  },
  { merge: false }
);

console.log('--- Lookups ---');
console.log(registry.t('fr', 'common:greeting', { name: 'world' }));
console.log(registry.t('fr', 'common:buttons.save'));
console.log(registry.t('fr', 'common:buttons.cancel'));

// ─── Example 2: regional fallback chain ──────────────────────────────────────

console.log('\n--- Fallback chain ---');
console.log(buildFallbackChain('fr-CA', 'en'));
console.log(buildFallbackChain('en', 'en'));

// ─── Example 3: subscribe to registry events ─────────────────────────────────

console.log('\n--- Events ---');
const unsubscribe = registry.onChange((change) => {
  const label = 'locale' in change ? `${change.namespace}:${change.locale}` : change.namespace;
  console.log(`[${change.kind}] ${label}`);
});

registry.setNamespaceLocale('dashboard', 'en', { title: 'Dashboard' }, { merge: false });
registry.setNamespaceLocale('dashboard', 'fr', { title: 'Tableau de bord' }, { merge: false });
registry.removeNamespace('dashboard');

unsubscribe();

// ─── Example 4: stats ────────────────────────────────────────────────────────

console.log('\n--- Stats ---');
console.log(registry.getStats());
