import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { JsonStateFile, writeJsonAtomic } from './json-state-file';

const Schema = z.object({ name: z.string(), count: z.number() });
type Value = z.infer<typeof Schema>;

describe('JsonStateFile', () => {
  let dir: string;
  let path: string;
  let file: JsonStateFile<Value>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'brika-jsf-'));
    path = join(dir, 'state.json');
    file = new JsonStateFile<Value>(path, { schema: Schema });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('persist then load round-trips the value', () => {
    file.persist({ name: 'a', count: 1 });
    expect(file.load()).toEqual({ name: 'a', count: 1 });
  });

  test('load returns null for a missing file', () => {
    expect(file.load()).toBeNull();
  });

  test('load returns null for malformed JSON', () => {
    writeFileSync(path, '{ not json', 'utf8');
    expect(file.load()).toBeNull();
  });

  test('load returns null when the content fails the schema', () => {
    writeFileSync(path, JSON.stringify({ name: 'a', count: 'nope' }), 'utf8');
    expect(file.load()).toBeNull();
  });

  test('persist is atomic (no leftover temp file) and 0600 on POSIX', () => {
    file.persist({ name: 'b', count: 2 });
    expect(existsSync(`${path}.tmp`)).toBe(false);
    if (process.platform !== 'win32') {
      expect(statSync(path).mode & 0o777).toBe(0o600);
    }
  });

  test('mutate re-reads from disk before applying', () => {
    file.persist({ name: 'a', count: 1 });
    // A separate holder of the same path writes concurrently…
    new JsonStateFile<Value>(path, { schema: Schema }).persist({ name: 'a', count: 5 });
    // …and mutate sees that latest value, not a stale in-memory one.
    const next = file.mutate((cur) => ({ name: 'a', count: (cur?.count ?? 0) + 1 }));
    expect(next.count).toBe(6);
    expect(file.load()?.count).toBe(6);
  });

  test('mutate receives null when the file does not exist yet', () => {
    const next = file.mutate((cur) => ({ name: 'fresh', count: cur === null ? 0 : 1 }));
    expect(next).toEqual({ name: 'fresh', count: 0 });
  });

  test('writeJsonAtomic honours the pretty flag', () => {
    writeJsonAtomic(path, { name: 'a', count: 1 }, { pretty: false });
    expect(Bun.file(path).text()).resolves.toBe('{"name":"a","count":1}');
  });
});
