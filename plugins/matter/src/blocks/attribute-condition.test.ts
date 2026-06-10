import { describe, expect, test } from 'bun:test';
import { conditionMet } from './attribute-condition';

describe('conditionMet: changes (default)', () => {
  test('fires when the value differs from the previous one', () => {
    expect(conditionMet({}, 'false', 'true')).toBe(true);
    expect(conditionMet({ when: 'changes' }, '20', '21')).toBe(true);
  });

  test('does not fire when the value is unchanged', () => {
    expect(conditionMet({}, 'true', 'true')).toBe(false);
    expect(conditionMet({ when: 'changes' }, '21', '21')).toBe(false);
  });

  test('fires on the first observed report (no previous value)', () => {
    expect(conditionMet({}, undefined, 'true')).toBe(true);
  });
});

describe('conditionMet: becomes', () => {
  test('fires when the value becomes the target', () => {
    expect(conditionMet({ when: 'becomes', value: 'true' }, 'false', 'true')).toBe(true);
  });

  test('matches booleans against their stringified form', () => {
    expect(conditionMet({ when: 'becomes', value: 'false' }, 'true', 'false')).toBe(true);
  });

  test('does not fire when the new value is not the target', () => {
    expect(conditionMet({ when: 'becomes', value: 'true' }, 'true', 'false')).toBe(false);
  });

  test('does not re-fire while the value stays at the target', () => {
    expect(conditionMet({ when: 'becomes', value: 'true' }, 'true', 'true')).toBe(false);
  });

  test('fires on the first report when it already equals the target', () => {
    expect(conditionMet({ when: 'becomes', value: 'short' }, undefined, 'short')).toBe(true);
  });

  test('never fires without a target value', () => {
    expect(conditionMet({ when: 'becomes' }, 'false', 'true')).toBe(false);
  });
});

describe('conditionMet: above (edge-triggered)', () => {
  test('fires when crossing the threshold upward', () => {
    expect(conditionMet({ when: 'above', value: '25' }, '24', '26')).toBe(true);
  });

  test('does not re-fire while staying above the threshold', () => {
    expect(conditionMet({ when: 'above', value: '25' }, '26', '27')).toBe(false);
  });

  test('fires again after dipping below and re-crossing', () => {
    expect(conditionMet({ when: 'above', value: '25' }, '26', '24')).toBe(false);
    expect(conditionMet({ when: 'above', value: '25' }, '24', '26')).toBe(true);
  });

  test('fires on the first report already above the threshold', () => {
    expect(conditionMet({ when: 'above', value: '25' }, undefined, '30')).toBe(true);
  });

  test('does not fire at exactly the threshold', () => {
    expect(conditionMet({ when: 'above', value: '25' }, '24', '25')).toBe(false);
  });

  test('guards non-numeric values and thresholds', () => {
    expect(conditionMet({ when: 'above', value: '25' }, '24', 'warm')).toBe(false);
    expect(conditionMet({ when: 'above', value: 'hot' }, '24', '26')).toBe(false);
    expect(conditionMet({ when: 'above', value: '' }, '24', '26')).toBe(false);
    expect(conditionMet({ when: 'above' }, '24', '26')).toBe(false);
  });

  test('non-numeric previous value counts as not satisfying (fires)', () => {
    expect(conditionMet({ when: 'above', value: '25' }, 'unknown', '26')).toBe(true);
  });
});

describe('conditionMet: below (edge-triggered)', () => {
  test('fires when crossing the threshold downward', () => {
    expect(conditionMet({ when: 'below', value: '20' }, '21', '19')).toBe(true);
  });

  test('does not re-fire while staying below the threshold', () => {
    expect(conditionMet({ when: 'below', value: '20' }, '19', '18')).toBe(false);
  });

  test('fires on the first report already below the threshold', () => {
    expect(conditionMet({ when: 'below', value: '20' }, undefined, '15')).toBe(true);
  });

  test('does not fire at exactly the threshold', () => {
    expect(conditionMet({ when: 'below', value: '20' }, '21', '20')).toBe(false);
  });

  test('handles decimal thresholds and values', () => {
    expect(conditionMet({ when: 'below', value: '20.5' }, '20.6', '20.4')).toBe(true);
  });
});
