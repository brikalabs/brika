import { describe, expect, test } from 'bun:test';
import { buildFallbackChain } from '../fallback';

describe('buildFallbackChain', () => {
  test('regional locale falls back through base to en', () => {
    expect(buildFallbackChain('fr-CH')).toEqual(['fr-CH', 'fr', 'en']);
  });

  test('base locale falls back to en', () => {
    expect(buildFallbackChain('fr')).toEqual(['fr', 'en']);
  });

  test('en returns just en, no duplicate', () => {
    expect(buildFallbackChain('en')).toEqual(['en']);
  });

  test('en regional dedupes the base', () => {
    expect(buildFallbackChain('en-US')).toEqual(['en-US', 'en']);
  });

  test('unknown locale still falls back to en', () => {
    expect(buildFallbackChain('xx')).toEqual(['xx', 'en']);
  });

  test('respects a custom fallback locale', () => {
    expect(buildFallbackChain('de', 'fr')).toEqual(['de', 'fr']);
  });
});
