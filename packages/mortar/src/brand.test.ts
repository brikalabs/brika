import { describe, expect, test } from 'bun:test';
import { BRAND_LINE, MORTAR_VERSION, MORTAR_WORDMARK } from './brand';

describe('brand constants', () => {
  test('MORTAR_VERSION matches the package.json semver shape', () => {
    expect(MORTAR_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('MORTAR_WORDMARK contains the package name', () => {
    expect(MORTAR_WORDMARK).toContain('mortar');
  });

  test('BRAND_LINE embeds the version and attribution', () => {
    expect(BRAND_LINE).toContain(`v${MORTAR_VERSION}`);
    expect(BRAND_LINE).toContain('Brika Labs');
  });
});
