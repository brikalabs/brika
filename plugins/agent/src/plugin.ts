/**
 * AI Agent plugin lifecycle.
 *
 * Blocks are discovered by `brika build` (which generates
 * `src/_generated/entry.ts`); this file holds only runtime setup.
 */

import { definePreferenceOptions } from '@brika/sdk';
import { log, onStop } from '@brika/sdk/lifecycle';
import { listModels } from './providers';

/**
 * Live model picker. The config UI calls this with the block's currently
 * selected `provider` (and `baseUrl`), so the dropdown shows exactly the models
 * that provider serves, each annotated with its context window and price.
 */
definePreferenceOptions('model', async (params) => {
  const provider = params?.provider === 'openai' ? 'openai' : 'anthropic';
  const baseUrl = typeof params?.baseUrl === 'string' ? params.baseUrl : undefined;
  const models = await listModels({ provider, baseUrl });
  return models.map((m) => ({ value: m.value, label: m.label, description: m.description }));
});

onStop(() => {
  log.info('AI Agent plugin stopping');
});

log.info('AI Agent plugin loaded');
