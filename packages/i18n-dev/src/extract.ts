import { flatten, type TranslationData } from '@brika/i18n';

/** Extract `{{var}}` interpolation variable names from a translation string. */
export function extractVariables(value: string): string[] {
  const vars: string[] = [];
  let from = 0;
  for (;;) {
    const open = value.indexOf('{{', from);
    if (open === -1) {
      break;
    }
    const close = value.indexOf('}}', open + 2);
    if (close === -1) {
      break;
    }
    const name = value.slice(open + 2, close).trim();
    if (name.length > 0) {
      vars.push(name);
    }
    from = close + 2;
  }
  return vars;
}

/**
 * Sorted list of leaf key paths inside a translation tree. Thin wrapper over
 * `@brika/i18n#flatten` that returns the sorted dotted paths.
 */
export function extractKeys(obj: TranslationData): string[] {
  const flat = flatten(obj);
  const keys = [...flat.keys()];
  keys.sort((a, b) => a.localeCompare(b));
  return keys;
}
