import { describe, expect, test } from 'bun:test';
import { CapabilityRegistry, defineCapability } from '@brika/capabilities';
import { z } from 'zod';
import {
  permissionFamiliesFromIds,
  permissionFamiliesFromManifestCapabilities,
  vectorForLegacyGrants,
  vectorFromManifestCapabilities,
} from '../vector';

function makeRegistry() {
  const reg = new CapabilityRegistry();
  reg.register(
    defineCapability(
      {
        id: 'dev.brika.net.fetch',
        args: z.object({}),
        result: z.object({}),
        permission: {
          name: 'net',
          scope: z.object({ allow: z.array(z.string()) }),
          defaultScope: { allow: [] },
        },
      },
      () => ({})
    )
  );
  reg.register(
    defineCapability(
      {
        id: 'dev.brika.secrets.get',
        args: z.object({}),
        result: z.object({}),
        permission: { name: 'secrets', scope: z.object({}), defaultScope: {} },
      },
      () => ({})
    )
  );
  return reg;
}

describe('vectorFromManifestCapabilities', () => {
  test('includes capabilities declared in the manifest with the granted scope', () => {
    const reg = makeRegistry();
    const vec = vectorFromManifestCapabilities(
      reg,
      { 'dev.brika.net.fetch': { allow: ['api.example.com'] } },
      { 'dev.brika.net.fetch': { allow: ['api.example.com'] } }
    );
    expect(vec.grants).toHaveLength(1);
    expect(vec.grants[0]).toMatchObject({
      id: 'dev.brika.net.fetch',
      ctxPath: 'net.fetch',
      scope: { allow: ['api.example.com'] },
    });
  });

  test('omits capabilities not in the manifest even if granted', () => {
    const reg = makeRegistry();
    const vec = vectorFromManifestCapabilities(
      reg,
      {},
      { 'dev.brika.net.fetch': { allow: ['api.example.com'] } }
    );
    expect(vec.grants).toEqual([]);
  });

  test('accepts both wrapped { scope } shape and bare scope value', () => {
    const reg = makeRegistry();
    const wrapped = vectorFromManifestCapabilities(
      reg,
      { 'dev.brika.net.fetch': { scope: { allow: ['x'] } } },
      { 'dev.brika.net.fetch': { allow: ['x'] } }
    );
    expect(wrapped.grants[0]?.scope).toEqual({ allow: ['x'] });

    const bare = vectorFromManifestCapabilities(
      reg,
      { 'dev.brika.net.fetch': { allow: ['y'] } },
      { 'dev.brika.net.fetch': { allow: ['y'] } }
    );
    expect(bare.grants[0]?.scope).toEqual({ allow: ['y'] });
  });
});

describe('permissionFamiliesFromIds (heuristic)', () => {
  test('extracts segment[2] of every reverse-DNS id', () => {
    expect(
      permissionFamiliesFromIds([
        'dev.brika.net.fetch',
        'dev.brika.net.fetch', // dup
        'dev.brika.secrets.get',
      ])
    ).toEqual(['net', 'secrets']);
  });

  test('ignores ids with fewer than three segments', () => {
    expect(permissionFamiliesFromIds(['flat', 'two.parts'])).toEqual([]);
  });
});

describe('permissionFamiliesFromManifestCapabilities (registry-based)', () => {
  test('reads the family from each capability spec', () => {
    const reg = makeRegistry();
    expect(
      permissionFamiliesFromManifestCapabilities(reg, {
        'dev.brika.net.fetch': {},
        'dev.brika.secrets.get': {},
      })
    ).toEqual(['net', 'secrets']);
  });

  test('skips ids not registered', () => {
    const reg = makeRegistry();
    expect(
      permissionFamiliesFromManifestCapabilities(reg, {
        'com.unknown.thing.do': {},
      })
    ).toEqual([]);
  });
});

describe('vectorForLegacyGrants — still works', () => {
  test('grants every capability whose family is in the legacy list', () => {
    const reg = makeRegistry();
    const vec = vectorForLegacyGrants(reg, ['net', 'secrets']);
    expect(vec.grants.map((g) => g.id).sort()).toEqual([
      'dev.brika.net.fetch',
      'dev.brika.secrets.get',
    ]);
  });
});
