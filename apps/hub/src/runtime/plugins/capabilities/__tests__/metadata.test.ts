import { describe, expect, test } from 'bun:test';
import { buildCapabilityMetadata, validateScopeForCapability } from '../metadata';

describe('buildCapabilityMetadata', () => {
  test('returns one row per manifest capability with spec-derived title/ui', () => {
    const rows = buildCapabilityMetadata(
      {
        'dev.brika.net.fetch': { allow: ['api.example.com'] },
      },
      {}
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'dev.brika.net.fetch',
      ctxPath: 'net.fetch',
      family: 'net',
      icon: 'globe',
      requestedScope: { allow: ['api.example.com'] },
      grantedScope: null,
      ui: { kind: 'string-array', field: 'allow' },
    });
    expect(rows[0]?.title).toBe('Make HTTP requests');
  });

  test('reports the user-granted scope when present', () => {
    const rows = buildCapabilityMetadata(
      { 'dev.brika.net.fetch': { allow: ['*'] } },
      { 'dev.brika.net.fetch': { allow: ['api.spotify.com'] } }
    );
    expect(rows[0]?.grantedScope).toEqual({ allow: ['api.spotify.com'] });
    expect(rows[0]?.requestedScope).toEqual({ allow: ['*'] });
  });

  test('drops capability ids not registered with the hub', () => {
    const rows = buildCapabilityMetadata({ 'com.unknown.thing': {} }, {});
    expect(rows).toEqual([]);
  });

  test("reports ui.kind = 'none' for permission-less capabilities", () => {
    const rows = buildCapabilityMetadata({ 'dev.brika.location.timezone': {} }, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ui).toEqual({ kind: 'none' });
    expect(rows[0]?.family).toBeNull();
  });
});

describe('validateScopeForCapability', () => {
  test('accepts a valid scope and returns the parsed value', () => {
    const result = validateScopeForCapability('dev.brika.net.fetch', {
      allow: ['api.example.com'],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scope).toEqual({ allow: ['api.example.com'] });
    }
  });

  test('rejects an unknown capability id', () => {
    const result = validateScopeForCapability('com.unknown.thing', {});
    expect(result.ok).toBe(false);
  });

  test('rejects a scope that fails the schema', () => {
    const result = validateScopeForCapability('dev.brika.net.fetch', { allow: 'oops' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });
});
