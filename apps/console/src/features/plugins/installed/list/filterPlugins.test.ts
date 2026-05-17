import { describe, expect, test } from 'bun:test';
import type { PluginListItem } from '../../../../shared/cli/api/plugins';
import { filterPlugins } from './FilterDraft';

const items: ReadonlyArray<PluginListItem> = [
  {
    uid: '1',
    name: '@brika/acme',
    displayName: 'Acme Suite',
    version: '1.0.0',
    status: 'running',
    pid: 1,
    description: 'Widget factory for the brika hub',
  },
  {
    uid: '2',
    name: '@brika/blocks',
    displayName: null,
    version: '0.1.0',
    status: 'stopped',
    pid: null,
    description: null,
  },
  {
    uid: '3',
    name: '@brika/forge',
    displayName: 'Forge',
    version: '2.0.0',
    status: 'running',
    pid: 2,
    description: 'Pipeline tooling',
  },
];

describe('filterPlugins', () => {
  test('empty filter returns every item (copied, not aliased)', () => {
    const result = filterPlugins(items, '');
    expect(result).toEqual([...items]);
    expect(result).not.toBe(items);
  });

  test('whitespace-only filter behaves like empty', () => {
    expect(filterPlugins(items, '   \t  ')).toEqual([...items]);
  });

  test('matches by package name, case-insensitively', () => {
    expect(filterPlugins(items, 'ACME').map((p) => p.uid)).toEqual(['1']);
  });

  test('matches by displayName', () => {
    expect(filterPlugins(items, 'forge').map((p) => p.uid)).toEqual(['3']);
  });

  test('matches by description', () => {
    expect(filterPlugins(items, 'widget').map((p) => p.uid)).toEqual(['1']);
  });

  test('tolerates null displayName / description fields', () => {
    expect(filterPlugins(items, 'blocks').map((p) => p.uid)).toEqual(['2']);
  });

  test('returns an empty list when nothing matches', () => {
    expect(filterPlugins(items, 'zzz-no-match')).toEqual([]);
  });
});
