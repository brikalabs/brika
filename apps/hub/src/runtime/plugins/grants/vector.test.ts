/**
 * Vector-construction unit tests for the hub.
 */

import { describe, expect, test } from 'bun:test';
import { buildHubGrants } from './registry-factory';
import { buildVectorWithUserConsent, familiesForManifestGrants } from './vector';

const stubCb = {
  fetch: () => Promise.resolve(new Response('', { status: 204 })),
};

describe('vector construction', () => {
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

  test('buildVectorWithUserConsent: undefined manifest grants yields empty vector', () => {
    const reg = buildHubGrants(stubCb);
    const v = buildVectorWithUserConsent(reg, undefined, ['net']);
    expect(v.grants).toEqual([]);
  });

  test('buildVectorWithUserConsent: empty manifest grants yields empty vector', () => {
    const reg = buildHubGrants(stubCb);
    const v = buildVectorWithUserConsent(reg, {}, ['net']);
    expect(v.grants).toEqual([]);
  });

  test('familiesForManifestGrants: derives the set of requested families from grant ids', () => {
    const reg = buildHubGrants(stubCb);
    const families = familiesForManifestGrants(reg, {
      'dev.brika.net.fetch': { allow: ['x'] },
      'dev.brika.location.get': {},
    });
    expect(families.toSorted((a, b) => a.localeCompare(b))).toEqual(['location', 'net']);
  });

  test('familiesForManifestGrants: returns empty for undefined manifest grants', () => {
    const reg = buildHubGrants(stubCb);
    expect(familiesForManifestGrants(reg, undefined)).toEqual([]);
  });

  test('buildVectorWithUserConsent: drops unknown grant ids and notifies onInvalidScope', () => {
    const reg = buildHubGrants(stubCb);
    const warnings: Array<{ id: string; message: string }> = [];
    const v = buildVectorWithUserConsent(
      reg,
      {
        'dev.brika.net.fetch': { allow: ['x'] },
        'com.unknown.foo': { something: true },
      },
      ['net'],
      (id, message) => warnings.push({ id, message })
    );
    expect(v.grants.map((g) => g.id)).toEqual(['dev.brika.net.fetch']);
    expect(warnings).toEqual([
      { id: 'com.unknown.foo', message: 'unknown grant — not registered with the hub' },
    ]);
  });

  test('buildVectorWithUserConsent: malformed scope is reported via onInvalidScope', () => {
    const reg = buildHubGrants(stubCb);
    const warnings: Array<{ id: string; message: string }> = [];
    const v = buildVectorWithUserConsent(
      reg,
      // `allow` is a string, not array — fails NetScopeSchema
      { 'dev.brika.net.fetch': { allow: 'not-an-array' } },
      ['net'],
      (id, message) => warnings.push({ id, message })
    );
    expect(v.grants).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.id).toBe('dev.brika.net.fetch');
  });
});
