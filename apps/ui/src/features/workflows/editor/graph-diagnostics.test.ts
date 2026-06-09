import { describe, expect, test } from 'bun:test';
import { inferTypes, T } from '@brika/type-system';
import type { Edge, Node } from '@xyflow/react';
import type { BlockDefinition } from './BlockToolbar';
import { collectDiagnostics, invalidEdgeIds } from './graph-diagnostics';
import { edgesToGraphEdges, nodesToGraphNodes } from './workflow-conversion';

function blockNode(
  id: string,
  type: string,
  ports: {
    inputs?: Array<{ id: string; name: string; type?: Record<string, unknown> }>;
    outputs?: Array<{ id: string; name: string; type?: Record<string, unknown> }>;
  },
  config: Record<string, unknown> = {}
): Node {
  return {
    id,
    type: 'block',
    position: { x: 0, y: 0 },
    data: {
      id,
      type,
      label: id,
      config,
      inputs: ports.inputs ?? [],
      outputs: ports.outputs ?? [],
    },
  };
}

function edge(source: string, sourceHandle: string, target: string, targetHandle: string): Edge {
  return {
    id: `${source}:${sourceHandle}->${target}:${targetHandle}`,
    source,
    sourceHandle,
    target,
    targetHandle,
  };
}

function descriptor(desc: unknown): Record<string, unknown> {
  return typeof desc === 'object' && desc !== null ? { ...desc } : {};
}

const DEFS: Record<string, BlockDefinition> = {
  log: {
    id: 'log',
    name: 'Log',
    description: '',
    icon: 'box',
    color: '#888',
    category: 'action',
    pluginId: 'test',
    inputs: [{ id: 'in', name: 'Input' }],
    outputs: [],
    schema: { type: 'object', properties: { message: {} }, required: ['message'] },
  },
  clock: {
    id: 'clock',
    name: 'Clock',
    description: '',
    icon: 'box',
    color: '#888',
    category: 'trigger',
    pluginId: 'test',
    inputs: [],
    outputs: [{ id: 'tick', name: 'Tick' }],
    schema: { type: 'object' },
  },
};

function diagnose(nodes: Node[], edges: Edge[]) {
  const portTypeMap = inferTypes(nodesToGraphNodes(nodes), edgesToGraphEdges(edges));
  return collectDiagnostics({ nodes, edges, portTypeMap, blockSchemaMap: DEFS });
}

describe('collectDiagnostics', () => {
  test('flags edges whose resolved types no longer fit', () => {
    // string -> number is NOT widenable (number -> string would be)
    const nodes = [
      blockNode('a', 'clock', {
        outputs: [{ id: 'tick', name: 'Tick', type: descriptor(T.string) }],
      }),
      blockNode(
        'b',
        'log',
        { inputs: [{ id: 'in', name: 'Input', type: descriptor(T.number) }] },
        { message: 'hi' }
      ),
    ];
    const edges = [edge('a', 'tick', 'b', 'in')];

    const diagnostics = diagnose(nodes, edges);
    const mismatch = diagnostics.find((d) => d.kind === 'type-mismatch');
    expect(mismatch).toBeDefined();
    expect(mismatch?.severity).toBe('error');
    expect(mismatch?.edgeId).toBe(edges[0].id);
    expect(invalidEdgeIds(diagnostics).has(edges[0].id)).toBeTrue();
  });

  test('flags missing required config and unknown block types', () => {
    const nodes = [
      blockNode('b', 'log', { inputs: [{ id: 'in', name: 'Input' }] }, { message: '' }),
      blockNode('ghost', 'vanished:block', {}),
    ];
    const diagnostics = diagnose(nodes, []);
    expect(diagnostics.some((d) => d.kind === 'missing-config' && d.nodeId === 'b')).toBeTrue();
    expect(diagnostics.some((d) => d.kind === 'unknown-block' && d.nodeId === 'ghost')).toBeTrue();
  });

  test('flags wiring cycles as warnings', () => {
    const nodes = [
      blockNode('a', 'clock', {
        inputs: [{ id: 'in', name: 'In' }],
        outputs: [{ id: 'tick', name: 'Tick' }],
      }),
      blockNode('b', 'clock', {
        inputs: [{ id: 'in', name: 'In' }],
        outputs: [{ id: 'tick', name: 'Tick' }],
      }),
    ];
    const edges = [edge('a', 'tick', 'b', 'in'), edge('b', 'tick', 'a', 'in')];
    const diagnostics = diagnose(nodes, edges);
    const cycle = diagnostics.find((d) => d.kind === 'cycle');
    expect(cycle).toBeDefined();
    expect(cycle?.severity).toBe('warning');
    expect(cycle?.message).toContain('a');
  });

  test('a clean compatible graph produces no diagnostics', () => {
    const nodes = [
      blockNode('a', 'clock', {
        outputs: [{ id: 'tick', name: 'Tick', type: descriptor(T.number) }],
      }),
      blockNode(
        'b',
        'log',
        { inputs: [{ id: 'in', name: 'Input', type: descriptor(T.number) }] },
        { message: 'ok' }
      ),
    ];
    expect(diagnose(nodes, [edge('a', 'tick', 'b', 'in')])).toEqual([]);
  });
});
