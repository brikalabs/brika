import { describe, expect, test } from 'bun:test';
import { NAV_SECTIONS } from '../../sections';
import { hotkeyFor } from './utils';

describe('hotkeyFor', () => {
  test('returns the configured hotkey for every NAV_SECTIONS entry', () => {
    for (const section of NAV_SECTIONS) {
      expect(hotkeyFor(section.key)).toBe(section.hotkey);
    }
  });

  test('returns "?" for unknown sections', () => {
    expect(hotkeyFor('not-a-section')).toBe('?');
    expect(hotkeyFor('')).toBe('?');
  });
});
