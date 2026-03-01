/**
 * Tests for defineBrick
 */

import { describe, expect, test } from 'bun:test';
import type {
  BrickComponent,
  BrickInstanceContext,
  BrickTypeSpec,
  CompiledBrickType,
} from '../define-brick';
import { defineBrick } from '../define-brick';
import { Stat, Text } from '../nodes';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const minimalSpec: BrickTypeSpec = {
  id: 'test-brick',
  families: ['sm'],
};

const fullSpec: BrickTypeSpec = {
  id: 'thermostat',
  name: 'Thermostat',
  description: 'Shows temperature and allows control',
  icon: 'thermometer',
  color: '#ff6b35',
  category: 'climate',
  families: ['sm', 'md', 'lg'],
  minSize: {
    w: 1,
    h: 1,
  },
  maxSize: {
    w: 6,
    h: 6,
  },
  config: [
    {
      name: 'room',
      type: 'text',
      label: 'Room name',
      default: 'Living Room',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('defineBrick', () => {
  test('returns a CompiledBrickType with spec and component', () => {
    const component: BrickComponent = () =>
      Text({
        content: 'hello',
      });
    const result = defineBrick(minimalSpec, component);

    expect(result).toHaveProperty('spec');
    expect(result).toHaveProperty('component');
    expect(result.spec).toBe(minimalSpec);
    expect(result.component).toBe(component);
  });

  test('preserves the exact spec reference', () => {
    const component: BrickComponent = () => [];
    const result = defineBrick(fullSpec, component);
    expect(result.spec).toBe(fullSpec);
  });

  test('preserves the exact component function reference', () => {
    const component: BrickComponent = () =>
      Text({
        content: 'x',
      });
    const result = defineBrick(minimalSpec, component);
    expect(result.component).toBe(component);
  });

  test('component can return a single ComponentNode', () => {
    const component: BrickComponent = (ctx) =>
      Stat({
        label: 'Temp',
        value: ctx.config.temp as number,
        unit: '°C',
      });
    const result = defineBrick(minimalSpec, component);

    const ctx: BrickInstanceContext = {
      instanceId: 'inst-1',
      config: {
        temp: 21.5,
      },
    };
    const output = result.component(ctx);
    expect(output).toHaveProperty('type', 'stat-value');
    expect(output).toHaveProperty('value', 21.5);
  });

  test('component can return an array of ComponentNodes', () => {
    const component: BrickComponent = () => [
      Stat({
        label: 'A',
        value: 1,
      }),
      Stat({
        label: 'B',
        value: 2,
      }),
    ];
    const result = defineBrick(minimalSpec, component);

    const ctx: BrickInstanceContext = {
      instanceId: 'inst-2',
      config: {},
    };
    const output = result.component(ctx);
    expect(Array.isArray(output)).toBe(true);
    expect((output as unknown[]).length).toBe(2);
  });

  test('spec with all fields is preserved', () => {
    const component: BrickComponent = () => [];
    const result = defineBrick(fullSpec, component);

    expect(result.spec.id).toBe('thermostat');
    expect(result.spec.name).toBe('Thermostat');
    expect(result.spec.description).toBe('Shows temperature and allows control');
    expect(result.spec.icon).toBe('thermometer');
    expect(result.spec.color).toBe('#ff6b35');
    expect(result.spec.category).toBe('climate');
    expect(result.spec.families).toEqual(['sm', 'md', 'lg']);
    expect(result.spec.minSize).toEqual({
      w: 1,
      h: 1,
    });
    expect(result.spec.maxSize).toEqual({
      w: 6,
      h: 6,
    });
    expect(result.spec.config).toHaveLength(1);
  });

  test('component receives instanceId and config', () => {
    const box: {
      ctx: BrickInstanceContext | null;
    } = {
      ctx: null,
    };
    const component: BrickComponent = (ctx) => {
      box.ctx = ctx;
      return Text({
        content: 'test',
      });
    };

    const result = defineBrick(minimalSpec, component);
    const ctx: BrickInstanceContext = {
      instanceId: 'brick-abc',
      config: {
        key1: 'value1',
        key2: 42,
      },
    };
    result.component(ctx);

    const receivedCtx = box.ctx;
    if (receivedCtx === null) {
      throw new Error('expected receivedCtx');
    }
    expect(receivedCtx.instanceId).toBe('brick-abc');
    expect(receivedCtx.config).toEqual({
      key1: 'value1',
      key2: 42,
    });
  });
});
