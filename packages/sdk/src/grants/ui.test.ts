/**
 * Unit tests for `grants/ui.ts` — schema parses, discriminated result,
 * redact behaviour for both cancelled + accepted branches, placeholder handler.
 */

import { describe, expect, test } from 'bun:test';
import { UiPickFileArgsSchema, UiPickFileResultSchema, UiScopeSchema, uiPickFile } from './ui';

const stubHandlerCtx = {
  pluginUid: 'plugin-x',
  pluginRoot: '/plugins/x',
  grantedScope: { acceptFilters: [] },
  log: () => undefined,
  signal: new AbortController().signal,
};

describe('UiScopeSchema', () => {
  test('defaults acceptFilters to []', () => {
    expect(UiScopeSchema.parse({})).toEqual({ acceptFilters: [] });
  });

  test('accepts a populated list', () => {
    expect(UiScopeSchema.parse({ acceptFilters: ['image/*'] })).toEqual({
      acceptFilters: ['image/*'],
    });
  });
});

describe('UiPickFileArgsSchema', () => {
  test('parses empty args', () => {
    expect(UiPickFileArgsSchema.parse({})).toEqual({});
  });

  test('parses accept + title', () => {
    expect(UiPickFileArgsSchema.parse({ accept: 'image/*', title: 'Pick' })).toEqual({
      accept: 'image/*',
      title: 'Pick',
    });
  });

  test('caps title length at 120', () => {
    expect(() => UiPickFileArgsSchema.parse({ title: 'x'.repeat(121) })).toThrow();
  });
});

describe('UiPickFileResultSchema', () => {
  test('parses the accepted branch', () => {
    expect(
      UiPickFileResultSchema.parse({
        cancelled: false,
        path: '/user/token123',
        fileName: 'photo.png',
      })
    ).toEqual({ cancelled: false, path: '/user/token123', fileName: 'photo.png' });
  });

  test('parses the cancelled branch', () => {
    expect(UiPickFileResultSchema.parse({ cancelled: true })).toEqual({ cancelled: true });
  });
});

describe('uiPickFile spec', () => {
  test('redact.result on cancelled returns { cancelled: true }', () => {
    const summary = uiPickFile.spec.redact?.result?.({ cancelled: true });
    expect(summary).toEqual({ cancelled: true });
  });

  test('redact.result on accepted drops path, keeps fileName', () => {
    const summary = uiPickFile.spec.redact?.result?.({
      cancelled: false,
      path: '/user/token123',
      fileName: 'photo.png',
    });
    expect(summary).toEqual({ cancelled: false, fileName: 'photo.png' });
  });

  test('SDK-side handler throws', () => {
    expect(() => uiPickFile.handler(stubHandlerCtx, {})).toThrow(/SDK-side handler invoked/);
  });

  test('carries ui permission with image icon', () => {
    expect(uiPickFile.spec.permission?.name).toBe('ui');
    expect(uiPickFile.spec.permission?.icon).toBe('image');
  });
});
