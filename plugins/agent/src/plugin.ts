/**
 * AI Agent plugin lifecycle.
 *
 * Blocks are discovered by `brika build` (which generates
 * `src/_generated/entry.ts`); this file holds only runtime setup.
 */

import { definePreferenceOptions } from '@brika/sdk';
import { log, onStop } from '@brika/sdk/lifecycle';
import { listAllModels } from './providers';

/**
 * Live model picker across every CONFIGURED provider: hosted providers appear
 * when their key is set in the plugin settings, Ollama when the local server
 * answers. Option values are model refs (`provider:model-id`), so blocks carry
 * no provider fields at all.
 */
definePreferenceOptions('model', async () => {
  const models = await listAllModels();
  return models.map((m) => ({ value: m.value, label: m.label, description: m.description }));
});

onStop(() => {
  log.info('AI Agent plugin stopping');
});

log.info('AI Agent plugin loaded');
