/**
 * Vector-construction unit tests for the hub. Exercises both the legacy
 * `permissions: string[]` shim and the structured `grants` map path.
 */

import { describe, expect, test } from 'bun:test';
import { buildHubGrants } from '../registry-factory';
import { buildVectorWithUserConsent, vectorForLegacyPermissions } from '../vector';

const stubCb = {
  fetch: () => Promise.resolve(new Response('', { status: 204 })),
};

describe('vector construction', () => {
  test('vectorForLegacyPermissions: net family → dev.brika.net.fetch with default empty allow-list', () => {
    const reg = buildHubGrants(stubCb);
    const v = vectorForLegacyPermissions(reg, ['net']);
    expect(v.grants).toEqual([
      {
        id: 'dev.brika.net.fetch',
        ctxPath: 'net.fetch',
        scope: { allow: [] },
      },
    ]);
  });

  test('vectorForLegacyPermissions: empty grants when family is not permitted', () => {
    const reg = buildHubGrants(stubCb);
    const v = vectorForLegacyPermissions(reg, []);
    expect(v.grants).toEqual([]);
  });

  test('buildVectorWithUserConsent: structured grants map carries per-grant scope', () => {
    const reg = buildHubGrants(stubCb);
    const v = buildVectorWithUserConsent(
      reg,
      { 'dev.brika.net.fetch': { allow: ['api.example.com'] } },
      ['net']
    );
    expect(v.grants).toEqual([
      {
        id: 'dev.brika.net.fetch',
        ctxPath: 'net.fetch',
        scope: { allow: ['api.example.com'] },
      },
    ]);
  });

  test('buildVectorWithUserConsent: drops grants whose permission family is not permitted', () => {
    const reg = buildHubGrants(stubCb);
    const v = buildVectorWithUserConsent(
      reg,
      { 'dev.brika.net.fetch': { allow: ['api.example.com'] } },
      []
    );
    expect(v.grants).toEqual([]);
  });

  test('buildVectorWithUserConsent: undefined manifest grants falls back to legacy permissions', () => {
    const reg = buildHubGrants(stubCb);
    const v = buildVectorWithUserConsent(reg, undefined, ['net']);
    expect(v.grants).toEqual([
      {
        id: 'dev.brika.net.fetch',
        ctxPath: 'net.fetch',
        scope: { allow: [] },
      },
    ]);
  });

  test('buildVectorWithUserConsent: empty manifest grants does NOT fall through to legacy', () => {
    const reg = buildHubGrants(stubCb);
    // Empty `{}` is the "I've migrated, requesting nothing" signal — even
    // with legacy permissions in play, we honour the empty structured map.
    const v = buildVectorWithUserConsent(reg, {}, ['net']);
    expect(v.grants).toEqual([]);
  });

  test('buildVectorWithUserConsent: drops unknown grant ids silently', () => {
    const reg = buildHubGrants(stubCb);
    const v = buildVectorWithUserConsent(
      reg,
      {
        'dev.brika.net.fetch': { allow: ['x'] },
        'com.unknown.foo': { something: true },
      },
      ['net']
    );
    expect(v.grants.map((g) => g.id)).toEqual(['dev.brika.net.fetch']);
  });
});
