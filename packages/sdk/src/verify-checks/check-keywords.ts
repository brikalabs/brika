import { registerCheck } from './registry';

registerCheck(({ pkg }) => {
  const keywordSet = new Set((pkg.keywords ?? []).map((k) => k.toLowerCase()));
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!keywordSet.has('brika')) {
    errors.push(
      'keywords must include "brika" so the plugin can be found by the npm registry search'
    );
  }
  if (!keywordSet.has('brika-plugin')) {
    warnings.push('keywords should include "brika-plugin" for better npm discoverability');
  }

  return { errors, warnings };
});
