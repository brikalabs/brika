import { describe, expect, test } from 'bun:test';
import { CapabilityRegistry, defineCapability } from '@brika/capabilities';
import { z } from 'zod';
import {
  buildVectorWithUserConsent,
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

describe('buildVectorWithUserConsent — user consent enforcement', () => {
  test('manifest does NOT auto-grant — no families granted = empty vector', () => {
    // The bug regression: previously, a plugin declaring
    // `capabilities: { 'dev.brika.net.fetch': { allow: [...] } }`
    // would receive net.fetch automatically without the user granting
    // 'net'. After the fix the vector is empty when grants is [].
    const reg = makeRegistry();
    const vec = buildVectorWithUserConsent(
      reg,
      { 'dev.brika.net.fetch': { allow: ['api.example.com'] } },
      []
    );
    expect(vec.grants).toEqual([]);
  });

  test('manifest capability is included when the matching family is granted', () => {
    const reg = makeRegistry();
    const vec = buildVectorWithUserConsent(
      reg,
      { 'dev.brika.net.fetch': { allow: ['api.example.com'] } },
      ['net']
    );
    expect(vec.grants).toHaveLength(1);
    expect(vec.grants[0]).toMatchObject({
      id: 'dev.brika.net.fetch',
      scope: { allow: ['api.example.com'] },
    });
  });

  test('a granted family without a manifest entry yields no grant', () => {
    // Symmetry: granting `net` without declaring net.fetch in the manifest
    // doesn't fabricate the capability.
    const reg = makeRegistry();
    const vec = buildVectorWithUserConsent(reg, {}, ['net']);
    expect(vec.grants).toEqual([]);
  });

  test('per-capability granularity within a family: user grants `net`, manifest only wants net.fetch — gets net.fetch only', () => {
    const reg = makeRegistry();
    // Register a hypothetical net.disconnect to verify only the manifest-
    // declared one comes through.
    reg.register(
      defineCapability(
        {
          id: 'dev.brika.net.disconnect',
          args: z.object({}),
          result: z.object({}),
          permission: {
            name: 'net',
            scope: z.object({}),
            defaultScope: {},
          },
        },
        () => ({})
      )
    );
    const vec = buildVectorWithUserConsent(reg, { 'dev.brika.net.fetch': { allow: [] } }, ['net']);
    expect(vec.grants.map((g) => g.id)).toEqual(['dev.brika.net.fetch']);
  });

  test('unknown capability ids in the manifest are silently dropped', () => {
    const reg = makeRegistry();
    const vec = buildVectorWithUserConsent(reg, { 'com.evil.unknown.cap': {} }, ['net', 'secrets']);
    expect(vec.grants).toEqual([]);
  });

  test('falls back to vectorForLegacyGrants when the manifest has no `capabilities`', () => {
    const reg = makeRegistry();
    const vec = buildVectorWithUserConsent(reg, undefined, ['net', 'secrets']);
    expect(vec.grants.map((g) => g.id).sort()).toEqual([
      'dev.brika.net.fetch',
      'dev.brika.secrets.get',
    ]);
  });

  test('always-on capabilities (no permission gate) flow through unconditionally', () => {
    const reg = new CapabilityRegistry();
    reg.register(
      defineCapability(
        { id: 'dev.brika.log.ping', args: z.object({}), result: z.object({}) },
        () => ({})
      )
    );
    // No manifest, no grants — still vended.
    const vec = buildVectorWithUserConsent(reg, undefined, []);
    expect(vec.grants.map((g) => g.id)).toEqual(['dev.brika.log.ping']);
  });
});
