import { describe, expect, it } from 'bun:test';
import { constantTimeEqual, parseSubprotocols } from './subprotocols';

describe('parseSubprotocols', () => {
  it('returns empty object for null/empty headers', () => {
    expect(parseSubprotocols(null)).toEqual({});
    expect(parseSubprotocols('')).toEqual({});
  });

  it('extracts the brika.v<n> protocol marker', () => {
    expect(parseSubprotocols('brika.v1')).toEqual({ proto: 'brika.v1' });
    expect(parseSubprotocols('brika.v42')).toEqual({ proto: 'brika.v42' });
  });

  it('extracts the bearer token from bearer.<token>', () => {
    expect(parseSubprotocols('brika.v1, bearer.abc123')).toEqual({
      proto: 'brika.v1',
      bearer: 'abc123',
    });
  });

  it('extracts the ticket token from ticket.<token> into the same bearer slot', () => {
    expect(parseSubprotocols('brika.v1, ticket.xyz789')).toEqual({
      proto: 'brika.v1',
      bearer: 'xyz789',
    });
  });

  it('trims whitespace around each part', () => {
    expect(parseSubprotocols('  brika.v1  ,   bearer.tok  ')).toEqual({
      proto: 'brika.v1',
      bearer: 'tok',
    });
  });

  it('ignores unknown tokens', () => {
    expect(parseSubprotocols('something-else, brika.v1')).toEqual({ proto: 'brika.v1' });
  });

  it('lets a later token override an earlier one of the same kind', () => {
    expect(parseSubprotocols('bearer.first, bearer.second')).toEqual({ bearer: 'second' });
  });
});

describe('constantTimeEqual', () => {
  it('returns true for identical strings', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('', '')).toBe(true);
  });

  it('returns false for different strings of the same length', () => {
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'xbc')).toBe(false);
  });

  it('returns false for strings of different lengths', () => {
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(constantTimeEqual('abc', '')).toBe(false);
  });

  it('handles non-ASCII code points', () => {
    expect(constantTimeEqual('héllo', 'héllo')).toBe(true);
    expect(constantTimeEqual('héllo', 'hellx')).toBe(false);
  });
});
