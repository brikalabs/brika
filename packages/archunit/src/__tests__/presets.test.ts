/**
 * Tests for archunit presets and custom rule
 */
import { describe, expect, test } from 'bun:test';
import { definePreset } from '../presets/define';
import { reactFeaturePreset } from '../presets/react';
import { servicePreset } from '../presets/service';
import { custom } from '../rules/custom';

describe('custom rule', () => {
  test('creates a rule with name and check function', () => {
    const check = async function* () {};
    const rule = custom('test-rule', check);
    expect(rule.name).toBe('test-rule');
    expect(rule.check).toBe(check);
  });

  test('creates a rule with optional fix function', () => {
    const check = async function* () {};
    const fix = async function* () {};
    const rule = custom('fixable-rule', check, fix);
    expect(rule.fix).toBe(fix);
  });
});

describe('definePreset', () => {
  test('returns a function that produces rules', () => {
    const preset = definePreset<{
      maxLines: number;
    }>((options) => [custom(`max-${options.maxLines}`, async function* () {})]);

    const rules = preset({
      maxLines: 100,
    });
    expect(rules).toHaveLength(1);
    expect(rules[0].name).toBe('max-100');
  });

  test('handles void options', () => {
    const preset = definePreset(() => [custom('always', async function* () {})]);

    const rules = preset();
    expect(rules).toHaveLength(1);
  });
});

describe('reactFeaturePreset', () => {
  test('returns rules with default options', () => {
    const rules = reactFeaturePreset();
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((r) => typeof r.name === 'string')).toBe(true);
  });

  test('accepts custom options', () => {
    const rules = reactFeaturePreset({
      featuresDir: 'app/features',
      pageMaxLines: 120,
      componentMaxLines: 200,
    });
    expect(rules.length).toBeGreaterThan(0);
  });
});

describe('servicePreset', () => {
  test('returns rules with default options', () => {
    const rules = servicePreset();
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((r) => typeof r.name === 'string')).toBe(true);
  });

  test('accepts custom options', () => {
    const rules = servicePreset({
      servicesDir: 'src/services',
      routesDir: 'src/routes',
      serviceMaxLines: 400,
      routeMaxLines: 250,
    });
    expect(rules.length).toBeGreaterThan(0);
  });
});
