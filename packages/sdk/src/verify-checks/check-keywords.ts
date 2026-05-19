import { registerCheck, type Suggestion } from './registry';

const BRIKA_KEYWORD_ERROR =
  'keywords must include "brika" so the plugin can be found by the npm registry search';
const BRIKA_PLUGIN_KEYWORD_WARNING =
  'keywords should include "brika-plugin" for better npm discoverability';

function buildKeywordsSnippet(existing: readonly string[], toAdd: readonly string[]): string {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const k of existing) {
    if (!seen.has(k)) {
      merged.push(k);
      seen.add(k);
    }
  }
  for (const k of toAdd) {
    if (!seen.has(k)) {
      merged.push(k);
      seen.add(k);
    }
  }
  return `"keywords": ${JSON.stringify(merged)}`;
}

registerCheck(({ pkg }) => {
  const existing = pkg.keywords ?? [];
  const keywordSet = new Set(existing.map((k) => k.toLowerCase()));
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: Suggestion[] = [];

  const missing: string[] = [];
  if (!keywordSet.has('brika')) {
    missing.push('brika');
  }
  if (!keywordSet.has('brika-plugin')) {
    missing.push('brika-plugin');
  }

  if (missing.length === 0) {
    return {};
  }

  const snippet = buildKeywordsSnippet(existing, missing);

  if (!keywordSet.has('brika')) {
    errors.push(BRIKA_KEYWORD_ERROR);
    suggestions.push({
      for: BRIKA_KEYWORD_ERROR,
      description: 'Add the missing keyword(s) to package.json',
      snippet,
      language: 'json',
    });
  }
  if (!keywordSet.has('brika-plugin')) {
    warnings.push(BRIKA_PLUGIN_KEYWORD_WARNING);
    suggestions.push({
      for: BRIKA_PLUGIN_KEYWORD_WARNING,
      description: 'Add the missing keyword(s) to package.json',
      snippet,
      language: 'json',
    });
  }

  return {
    errors,
    warnings,
    suggestions,
  };
});
