import { describe, expect, test } from 'bun:test';
import { T } from '@brika/type-system';
import type { BlockDefinition } from './BlockToolbar';
import {
  compatibleBlocksForSource,
  compatibleBlocksForTarget,
  typeLabel,
} from './connection-compat';

interface PortSpec {
  id: string;
  name: string;
  type?: Record<string, unknown>;
}

function block(id: string, inputs: PortSpec[], outputs: PortSpec[]): BlockDefinition {
  return {
    id,
    name: id,
    description: '',
    icon: 'box',
    color: '#888888',
    category: 'action',
    pluginId: 'test',
    inputs,
    outputs,
    schema: { type: 'object' },
  };
}

function descriptor(desc: unknown): Record<string, unknown> | undefined {
  return typeof desc === 'object' && desc !== null ? { ...desc } : undefined;
}

const logBlock = block('log', [{ id: 'in', name: 'Input', type: descriptor(T.string) }], []);
const mathBlock = block(
  'math',
  [{ id: 'value', name: 'Value', type: descriptor(T.number) }],
  [{ id: 'result', name: 'Result', type: descriptor(T.number) }]
);
const passBlock = block(
  'pass',
  [{ id: 'in', name: 'Input', type: descriptor(T.generic()) }],
  [{ id: 'out', name: 'Output', type: descriptor(T.generic()) }]
);
const triggerBlock = block(
  'button',
  [],
  [{ id: 'press', name: 'Press', type: descriptor(T.obj({ ts: T.number })) }]
);

const CATALOG = [logBlock, mathBlock, passBlock, triggerBlock];

describe('compatibleBlocksForSource', () => {
  test('keeps blocks with a compatible input and remembers the port', () => {
    const result = compatibleBlocksForSource(CATALOG, T.string);
    const ids = result.map((r) => r.block.id);
    expect(ids).toContain('log');
    expect(ids).toContain('pass');
    expect(ids).not.toContain('math');
    expect(ids).not.toContain('button');
    const log = result.find((r) => r.block.id === 'log');
    expect(log?.portId).toBe('in');
  });

  test('an unresolved source type matches every block with inputs', () => {
    const result = compatibleBlocksForSource(CATALOG, undefined);
    expect(result.map((r) => r.block.id).sort()).toEqual(['log', 'math', 'pass']);
  });

  test('object source matches object-shaped and generic inputs only', () => {
    const result = compatibleBlocksForSource(CATALOG, T.obj({ ts: T.number }));
    const ids = result.map((r) => r.block.id);
    expect(ids).toContain('pass');
    expect(ids).not.toContain('math');
  });
});

describe('compatibleBlocksForTarget', () => {
  test('keeps blocks with a compatible output', () => {
    const result = compatibleBlocksForTarget(CATALOG, T.number);
    const ids = result.map((r) => r.block.id);
    expect(ids).toContain('math');
    expect(ids).toContain('pass');
    expect(ids).not.toContain('log');
  });

  test('an unresolved target type matches every block with outputs', () => {
    const result = compatibleBlocksForTarget(CATALOG, undefined);
    expect(result.map((r) => r.block.id).sort()).toEqual(['button', 'math', 'pass']);
  });
});

describe('typeLabel', () => {
  test('renders a descriptor and falls back when unknown', () => {
    expect(typeLabel(T.string, 'generic')).toBe('string');
    expect(typeLabel(undefined, 'generic')).toBe('generic');
  });
});
