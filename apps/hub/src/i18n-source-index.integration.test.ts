/**
 * Tests for the i18n source-file index + write-path safety.
 *
 * These cover the three defense layers added on top of the registry:
 *   - URL-param shape (`assertSafeSegment`)
 *   - Containment within allow-roots + symlink leaf rejection (`ensureSafePath`)
 *   - Recursive prototype-pollution scan (`assertNoUnsafeKeys`)
 */

import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TranslationRegistry, UnsafeKeyPathError } from '@brika/i18n';
import {
  assertNoUnsafeKeys,
  assertSafeSegment,
  UnsafeSegmentError,
} from '@/runtime/i18n/i18n-key-safety';
import { SourceIndex } from '@/runtime/i18n/i18n-source-index';

describe('assertSafeSegment', () => {
  test('accepts plain identifiers', () => {
    for (const ns of ['common', 'permissions', 'foo-bar', 'a_b_c']) {
      expect(() => assertSafeSegment(ns, 'namespace')).not.toThrow();
    }
    for (const loc of ['en', 'en-US', 'fr_FR', 'zh-Hans-CN']) {
      expect(() => assertSafeSegment(loc, 'locale')).not.toThrow();
    }
  });

  test('accepts scoped plugin namespaces', () => {
    expect(() => assertSafeSegment('plugin:@brika/timer', 'namespace')).not.toThrow();
    expect(() => assertSafeSegment('plugin:@scope/name', 'namespace')).not.toThrow();
  });

  test('rejects directory-traversal segments', () => {
    for (const value of ['..', '.', '../etc', 'foo/../bar', 'a/../b']) {
      expect(() => assertSafeSegment(value, 'namespace')).toThrow(UnsafeSegmentError);
    }
  });

  test('rejects path separators', () => {
    expect(() => assertSafeSegment('foo/bar', 'namespace')).toThrow();
    expect(() => assertSafeSegment('foo\\bar', 'namespace')).toThrow();
    expect(() => assertSafeSegment('a/b', 'locale')).toThrow();
  });

  test('rejects prototype-pollution keywords', () => {
    for (const value of ['__proto__', 'constructor', 'prototype']) {
      expect(() => assertSafeSegment(value, 'namespace')).toThrow();
      expect(() => assertSafeSegment(value, 'locale')).toThrow();
    }
  });

  test('rejects empty strings', () => {
    expect(() => assertSafeSegment('', 'namespace')).toThrow();
    expect(() => assertSafeSegment('', 'locale')).toThrow();
  });
});

describe('assertNoUnsafeKeys', () => {
  test('accepts a clean nested tree', () => {
    const tree = { a: { b: { c: 'leaf' } }, d: 'top' };
    expect(() => assertNoUnsafeKeys(tree)).not.toThrow();
  });

  test('rejects shallow __proto__ planted by JSON.parse', () => {
    const tree = JSON.parse('{"__proto__": {"boom": 1}}');
    expect(() => assertNoUnsafeKeys(tree)).toThrow(UnsafeKeyPathError);
  });

  test('rejects deeply nested __proto__', () => {
    const tree = JSON.parse('{"a": {"b": {"__proto__": {"boom": 1}}}}');
    expect(() => assertNoUnsafeKeys(tree)).toThrow(UnsafeKeyPathError);
  });

  test('rejects constructor / prototype anywhere', () => {
    expect(() => assertNoUnsafeKeys(JSON.parse('{"constructor": {}}'))).toThrow();
    expect(() => assertNoUnsafeKeys(JSON.parse('{"a": {"prototype": {}}}'))).toThrow();
  });
});

describe('SourceIndex.write — path safety', () => {
  let workDir: string;
  let outsideDir: string;
  let registry: TranslationRegistry;
  let sources: SourceIndex;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'brika-i18n-src-'));
    outsideDir = mkdtempSync(join(tmpdir(), 'brika-i18n-outside-'));
    registry = new TranslationRegistry();
    sources = new SourceIndex({
      registry,
      getAllowedRoots: () => [workDir],
    });
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
    rmSync(outsideDir, { recursive: true, force: true });
  });

  test('writes to a regular file inside the allow-root', async () => {
    mkdirSync(join(workDir, 'en'));
    const path = join(workDir, 'en', 'common.json');
    writeFileSync(path, '{}');
    sources.record({ namespace: 'common', locale: 'en', path, kind: 'hub' });

    await sources.write('common', 'en', 'hello', 'world');
    expect(registry.getNamespaceTranslations('en', 'common')).toEqual({ hello: 'world' });
  });

  test('refuses to follow a symlink at the target leaf', async () => {
    const target = join(outsideDir, 'pwned.json');
    writeFileSync(target, '{}');
    mkdirSync(join(workDir, 'en'));
    const link = join(workDir, 'en', 'common.json');
    symlinkSync(target, link);
    sources.record({ namespace: 'common', locale: 'en', path: link, kind: 'hub' });

    await expect(sources.write('common', 'en', 'hello', 'world')).rejects.toThrow(
      /refusing to follow symlink/
    );
  });

  test('refuses to write outside the configured allow-roots', async () => {
    const path = join(outsideDir, 'common.json');
    writeFileSync(path, '{}');
    sources.record({ namespace: 'common', locale: 'en', path, kind: 'hub' });

    await expect(sources.write('common', 'en', 'k', 'v')).rejects.toThrow(
      /refusing to write outside allowed roots/
    );
  });

  test('rejects unsafe namespace / locale URL params', async () => {
    await expect(sources.write('..', 'en', 'k', 'v')).rejects.toThrow(UnsafeSegmentError);
    await expect(sources.write('common', '../etc', 'k', 'v')).rejects.toThrow(UnsafeSegmentError);
    await expect(sources.write('common', 'a/b', 'k', 'v')).rejects.toThrow(UnsafeSegmentError);
  });

  test('rejects parsed JSON with prototype-pollution segments', async () => {
    mkdirSync(join(workDir, 'en'));
    const path = join(workDir, 'en', 'common.json');
    writeFileSync(path, '{"__proto__": {"boom": 1}, "ok": "fine"}');
    sources.record({ namespace: 'common', locale: 'en', path, kind: 'hub' });

    await expect(sources.write('common', 'en', 'safe', 'value')).rejects.toThrow(
      UnsafeKeyPathError
    );
  });

  test('throws when no source entry is registered for the pair', async () => {
    await expect(sources.write('common', 'en', 'k', 'v')).rejects.toThrow(/No on-disk source/);
  });
});
