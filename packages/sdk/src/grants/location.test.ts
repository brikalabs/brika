/**
 * Unit tests for `grants/location.ts` — verifies the empty scope shape,
 * the result schema's nullable location object, and the placeholder handler.
 */

import { describe, expect, test } from 'bun:test';
import {
  LocationGetArgsSchema,
  LocationGetResultSchema,
  LocationScopeSchema,
  locationGet,
} from './location';

const stubHandlerCtx = {
  pluginUid: 'plugin-x',
  pluginRoot: '/plugins/x',
  grantedScope: {},
  log: () => undefined,
  signal: new AbortController().signal,
};

describe('LocationScopeSchema', () => {
  test('accepts empty object', () => {
    expect(LocationScopeSchema.parse({})).toEqual({});
  });

  test('rejects additional keys (strict)', () => {
    expect(() => LocationScopeSchema.parse({ unexpected: true })).toThrow();
  });
});

describe('LocationGetArgsSchema', () => {
  test('parses empty args', () => {
    expect(LocationGetArgsSchema.parse({})).toEqual({});
  });
});

describe('LocationGetResultSchema', () => {
  test('parses a populated location', () => {
    const result = LocationGetResultSchema.parse({
      location: {
        latitude: 46.2,
        longitude: 6.14,
        street: '1 Main St',
        city: 'Geneva',
        state: 'GE',
        postalCode: '1200',
        country: 'Switzerland',
        countryCode: 'CH',
        formattedAddress: '1 Main St, 1200 Geneva, CH',
      },
    });
    expect(result.location?.city).toBe('Geneva');
  });

  test('parses null location', () => {
    expect(LocationGetResultSchema.parse({ location: null })).toEqual({ location: null });
  });
});

describe('locationGet spec', () => {
  test('carries permission gate with map-pin icon', () => {
    expect(locationGet.spec.permission?.name).toBe('location');
    expect(locationGet.spec.permission?.icon).toBe('map-pin');
  });

  test('SDK-side handler throws', () => {
    expect(() => locationGet.handler(stubHandlerCtx, {})).toThrow(/SDK-side handler invoked/);
  });
});
