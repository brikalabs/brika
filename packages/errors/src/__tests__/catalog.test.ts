/**
 * Catalog coverage / shape tests.
 *
 * - Asserts every catalog entry has a well-formed shape (no typos in
 *   severity / category, httpStatus is a sane code, i18nKey when present
 *   begins with "errors.").
 * - Scans the monorepo for `new BrikaError('CODE', ...)` literals and
 *   asserts every code is present in the catalog (or is intentionally
 *   uncataloged — but the test will surface it for review).
 */

import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import enLocale from '../../locales/en/errors.json' with { type: 'json' };
import frLocale from '../../locales/fr/errors.json' with { type: 'json' };
import { ERROR_CATEGORIES, ERROR_SEVERITIES, ErrorCatalog, lookupCatalogEntry } from '../catalog';

const REPO_ROOT = join(import.meta.dir, '..', '..', '..', '..');
const SEARCH_DIRS = ['packages', 'apps'];
const SEARCH_EXTS = ['.ts', '.tsx'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__', '__benchmarks__', '.bun']);

describe('ErrorCatalog shape', () => {
  it('every entry has a well-formed shape', () => {
    for (const [code, entry] of Object.entries(ErrorCatalog)) {
      expect(typeof entry.description).toBe('string');
      expect(entry.description.length).toBeGreaterThan(0);

      expect(entry.status).toBeGreaterThanOrEqual(400);
      expect(entry.status).toBeLessThan(600);

      expect(typeof entry.title).toBe('string');
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.typeUri.startsWith('https://brika.dev/errors/')).toBe(true);
      expect(typeof entry.retryable).toBe('boolean');
      expect(typeof entry.transient).toBe('boolean');
      expect(typeof entry.message).toBe('function');

      expect(ERROR_SEVERITIES).toContain(entry.severity);
      expect(ERROR_CATEGORIES).toContain(entry.category);

      if (entry.i18nKey !== undefined) {
        expect(entry.i18nKey.startsWith('errors:')).toBe(true);
      }

      // Catalog rows that declare a `data` schema must be Zod schemas.
      if (entry.data !== undefined) {
        expect(typeof entry.data.safeParse).toBe('function');
      }

      // No empty code keys.
      expect(code.length).toBeGreaterThan(0);
    }
  });

  it('lookupCatalogEntry round-trips for every catalog key', () => {
    for (const code of Object.keys(ErrorCatalog)) {
      expect(lookupCatalogEntry(code)).toBeDefined();
    }
  });

  it('lookupCatalogEntry returns undefined for unknown codes', () => {
    expect(lookupCatalogEntry('NEVER_HEARD_OF_THIS')).toBeUndefined();
  });
});

describe('Locale coverage', () => {
  const locales: Record<string, Record<string, unknown>> = { en: enLocale, fr: frLocale };
  const placeholderRe = /\{\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\}\}/g;

  it('every cataloged i18nKey resolves to a {title, message, ...} object in every locale', () => {
    const gaps: string[] = [];
    for (const [code, entry] of Object.entries(ErrorCatalog)) {
      const suffix = i18nSuffix(entry.i18nKey);
      if (suffix === undefined) {
        if (entry.i18nKey) {
          gaps.push(`${code} has malformed i18nKey "${entry.i18nKey}"`);
        }
        continue;
      }
      for (const [lang, bundle] of Object.entries(locales)) {
        gaps.push(...checkLocaleEntry(lang, suffix, code, bundle));
      }
    }
    expect(gaps).toEqual([]);
  });

  it('locale files have the same key set across languages', () => {
    const en = Object.keys(enLocale).sort((a, b) => a.localeCompare(b));
    const fr = Object.keys(frLocale).sort((a, b) => a.localeCompare(b));
    expect(en).toEqual(fr);
  });

  it('locale templates only reference {{var}} names that exist in the catalog data schema', () => {
    const gaps: string[] = [];
    for (const [code, entry] of Object.entries(ErrorCatalog)) {
      const suffix = i18nSuffix(entry.i18nKey);
      if (suffix === undefined) {
        continue;
      }
      const dataKeys = readObjectShapeKeys(entry.data);
      for (const [lang, bundle] of Object.entries(locales)) {
        gaps.push(...checkPlaceholders(lang, suffix, code, bundle, dataKeys, placeholderRe));
      }
    }
    expect(gaps).toEqual([]);
  });
});

/** Parse the `errors:<suffix>` form. Returns undefined for missing/malformed keys. */
function i18nSuffix(i18nKey: string | undefined): string | undefined {
  if (!i18nKey) {
    return undefined;
  }
  const suffix = i18nKey.split(':')[1];
  return suffix && suffix.length > 0 ? suffix : undefined;
}

function asLocaleNode(
  bundle: Record<string, unknown>,
  suffix: string
): Record<string, unknown> | undefined {
  const node = bundle[suffix];
  if (node === null || typeof node !== 'object') {
    return undefined;
  }
  return node as Record<string, unknown>;
}

function checkLocaleEntry(
  lang: string,
  suffix: string,
  code: string,
  bundle: Record<string, unknown>
): string[] {
  const fields = asLocaleNode(bundle, suffix);
  if (!fields) {
    return [`${lang}/${suffix} (for ${code}) is not an object`];
  }
  const gaps: string[] = [];
  if (typeof fields.message !== 'string') {
    gaps.push(`${lang}/${suffix}.message (for ${code}) is missing or not a string`);
  }
  if (typeof fields.title !== 'string') {
    gaps.push(`${lang}/${suffix}.title (for ${code}) is missing or not a string`);
  }
  if ('developerHint' in fields && typeof fields.developerHint !== 'string') {
    gaps.push(`${lang}/${suffix}.developerHint (for ${code}) is not a string`);
  }
  return gaps;
}

function checkPlaceholders(
  lang: string,
  suffix: string,
  code: string,
  bundle: Record<string, unknown>,
  dataKeys: Set<string>,
  re: RegExp
): string[] {
  const fields = asLocaleNode(bundle, suffix);
  if (!fields) {
    return [];
  }
  const gaps: string[] = [];
  for (const [field, value] of Object.entries(fields)) {
    if (typeof value !== 'string') {
      continue;
    }
    for (const match of value.matchAll(re)) {
      const name = match[1];
      if (name && !dataKeys.has(name)) {
        gaps.push(`${lang}/${suffix}.${field} references "{{${name}}}" not in ${code}.data`);
      }
    }
  }
  return gaps;
}

function readObjectShapeKeys(schema: unknown): Set<string> {
  if (schema === null || typeof schema !== 'object' || !('shape' in schema)) {
    return new Set();
  }
  const shape = schema.shape;
  if (shape === null || typeof shape !== 'object') {
    return new Set();
  }
  return new Set(Object.keys(shape));
}

describe('Source code coverage', () => {
  it("every `new BrikaError('CODE', ...)` literal in src is in the catalog", () => {
    const codes = new Set<string>();
    for (const dir of SEARCH_DIRS) {
      collectCodes(join(REPO_ROOT, dir), codes);
    }

    const missing = [...codes].filter((c) => lookupCatalogEntry(c) === undefined);

    // PLUGIN_DEFINED_CODE is used in tests as an intentional uncataloged case.
    const allowedUncataloged = new Set(['PLUGIN_DEFINED_CODE']);
    const unexpected = missing.filter((c) => !allowedUncataloged.has(c));

    expect(unexpected).toEqual([]);
  });
});

function collectCodes(root: string, codes: Set<string>): void {
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) {
      continue;
    }
    const path = join(root, name);
    let st;
    try {
      st = statSync(path);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      collectCodes(path, codes);
    } else if (SEARCH_EXTS.some((ext) => name.endsWith(ext))) {
      extractCodesFromFile(path, codes);
    }
  }
}

const LITERAL_RE = /new\s+BrikaError\s*\(\s*['"]([A-Z][A-Z0-9_]*)['"]/g;

function extractCodesFromFile(path: string, codes: Set<string>): void {
  let content: string;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const match of content.matchAll(LITERAL_RE)) {
    const code = match[1];
    if (code) {
      codes.add(code);
    }
  }
}
