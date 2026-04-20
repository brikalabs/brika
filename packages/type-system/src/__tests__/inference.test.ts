import { describe, expect, it } from 'bun:test';
import { T } from '../descriptor';
import {
  type GraphEdge,
  type GraphNode,
  inferTypes,
  portKey,
  type TypeResolver,
} from '../inference';

function makeNode(
  id: string,
  ports: Record<
    string,
    { direction: 'input' | 'output'; type: import('../descriptor').TypeDescriptor }
  >
): GraphNode {
  return { id, ports };
}

function makeEdge(
  sourceNode: string,
  sourcePort: string,
  targetNode: string,
  targetPort: string
): GraphEdge {
  return { sourceNode, sourcePort, targetNode, targetPort };
}

describe('inferTypes', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Concrete types (no inference needed)
  // ─────────────────────────────────────────────────────────────────────────

  it('returns concrete types as-is', () => {
    const nodes = [
      makeNode('a', {
        out: { direction: 'output', type: T.string },
      }),
    ];
    const result = inferTypes(nodes, []);
    expect(result.get(portKey('a', 'out'))).toEqual(T.string);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Forward propagation
  // ─────────────────────────────────────────────────────────────────────────

  it('propagates concrete output type to generic input', () => {
    const nodes = [
      makeNode('a', {
        out: { direction: 'output', type: T.obj({ name: T.string }) },
      }),
      makeNode('b', {
        in: { direction: 'input', type: T.generic() },
      }),
    ];
    const edges = [makeEdge('a', 'out', 'b', 'in')];

    const result = inferTypes(nodes, edges);
    expect(result.get(portKey('b', 'in'))).toEqual(T.obj({ name: T.string }));
  });

  it('does not overwrite concrete input types', () => {
    const nodes = [
      makeNode('a', {
        out: { direction: 'output', type: T.string },
      }),
      makeNode('b', {
        in: { direction: 'input', type: T.number },
      }),
    ];
    const edges = [makeEdge('a', 'out', 'b', 'in')];

    const result = inferTypes(nodes, edges);
    expect(result.get(portKey('b', 'in'))).toEqual(T.number); // unchanged
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Passthrough resolution
  // ─────────────────────────────────────────────────────────────────────────

  it('resolves passthrough output from input type', () => {
    const nodes = [
      makeNode('a', {
        out: { direction: 'output', type: T.obj({ x: T.number }) },
      }),
      makeNode('cond', {
        in: { direction: 'input', type: T.generic() },
        then: { direction: 'output', type: T.passthrough('in') },
        else: { direction: 'output', type: T.passthrough('in') },
      }),
    ];
    const edges = [makeEdge('a', 'out', 'cond', 'in')];

    const result = inferTypes(nodes, edges);

    // Input gets the type from 'a'
    expect(result.get(portKey('cond', 'in'))).toEqual(T.obj({ x: T.number }));

    // Passthrough outputs inherit from input
    expect(result.get(portKey('cond', 'then'))).toEqual(T.obj({ x: T.number }));
    expect(result.get(portKey('cond', 'else'))).toEqual(T.obj({ x: T.number }));
  });

  it('chains passthrough across multiple blocks', () => {
    const nodes = [
      makeNode('source', {
        out: { direction: 'output', type: T.obj({ id: T.string }) },
      }),
      makeNode('delay', {
        in: { direction: 'input', type: T.generic() },
        out: { direction: 'output', type: T.passthrough('in') },
      }),
      makeNode('cond', {
        in: { direction: 'input', type: T.generic() },
        then: { direction: 'output', type: T.passthrough('in') },
      }),
    ];
    const edges = [
      makeEdge('source', 'out', 'delay', 'in'),
      makeEdge('delay', 'out', 'cond', 'in'),
    ];

    const result = inferTypes(nodes, edges);
    expect(result.get(portKey('cond', 'then'))).toEqual(T.obj({ id: T.string }));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Backward propagation
  // ─────────────────────────────────────────────────────────────────────────

  it('propagates concrete input type back to generic output', () => {
    const nodes = [
      makeNode('a', {
        out: { direction: 'output', type: T.generic() },
      }),
      makeNode('b', {
        in: { direction: 'input', type: T.number },
      }),
    ];
    const edges = [makeEdge('a', 'out', 'b', 'in')];

    const result = inferTypes(nodes, edges);
    expect(result.get(portKey('a', 'out'))).toEqual(T.number);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // External type resolution ($resolve)
  // ─────────────────────────────────────────────────────────────────────────

  it('resolves $resolve markers via TypeResolver', () => {
    const nodes: GraphNode[] = [
      {
        id: 'spark-trigger',
        ports: {
          out: { direction: 'output', type: T.resolved('spark', 'sparkType') },
        },
        config: { sparkType: 'timer:timer-started' },
      },
    ];

    const resolver: TypeResolver = {
      resolve(source, key) {
        if (source === 'spark' && key === 'timer:timer-started') {
          return T.obj({ duration: T.number, name: T.string });
        }
        return null;
      },
    };

    const result = inferTypes(nodes, [], resolver);
    expect(result.get(portKey('spark-trigger', 'out'))).toEqual(
      T.obj({ duration: T.number, name: T.string })
    );
  });

  it('resolved type propagates to downstream generic inputs', () => {
    const nodes: GraphNode[] = [
      {
        id: 'trigger',
        ports: {
          out: { direction: 'output', type: T.resolved('spark', 'sparkType') },
        },
        config: { sparkType: 'timer:tick' },
      },
      makeNode('handler', {
        in: { direction: 'input', type: T.generic() },
        out: { direction: 'output', type: T.passthrough('in') },
      }),
    ];
    const edges = [makeEdge('trigger', 'out', 'handler', 'in')];

    const resolver: TypeResolver = {
      resolve(source, key) {
        if (source === 'spark' && key === 'timer:tick') {
          return T.obj({ count: T.number });
        }
        return null;
      },
    };

    const result = inferTypes(nodes, edges, resolver);
    expect(result.get(portKey('handler', 'in'))).toEqual(T.obj({ count: T.number }));
    expect(result.get(portKey('handler', 'out'))).toEqual(T.obj({ count: T.number }));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Complex graph
  // ─────────────────────────────────────────────────────────────────────────

  it('handles a realistic workflow graph', () => {
    const nodes: GraphNode[] = [
      // Spark trigger → outputs {duration: number, name: string}
      {
        id: 'trigger',
        ports: {
          out: { direction: 'output', type: T.resolved('spark', 'sparkType') },
        },
        config: { sparkType: 'timer:completed' },
      },
      // Condition block → passthrough
      makeNode('check', {
        in: { direction: 'input', type: T.generic() },
        then: { direction: 'output', type: T.passthrough('in') },
        else: { direction: 'output', type: T.passthrough('in') },
      }),
      // Log block → generic in, passthrough out
      makeNode('log', {
        in: { direction: 'input', type: T.generic() },
        out: { direction: 'output', type: T.passthrough('in') },
      }),
      // HTTP block → concrete input, concrete output
      makeNode('http', {
        trigger: { direction: 'input', type: T.generic() },
        response: { direction: 'output', type: T.obj({ status: T.number, body: T.string }) },
        error: { direction: 'output', type: T.obj({ message: T.string }) },
      }),
    ];

    const edges = [
      makeEdge('trigger', 'out', 'check', 'in'),
      makeEdge('check', 'then', 'log', 'in'),
      makeEdge('check', 'else', 'http', 'trigger'),
    ];

    const resolver: TypeResolver = {
      resolve(source, key) {
        if (source === 'spark' && key === 'timer:completed') {
          return T.obj({ duration: T.number, name: T.string });
        }
        return null;
      },
    };

    const result = inferTypes(nodes, edges, resolver);

    const timerType = T.obj({ duration: T.number, name: T.string });

    // Trigger output resolved
    expect(result.get(portKey('trigger', 'out'))).toEqual(timerType);

    // Condition gets type from trigger
    expect(result.get(portKey('check', 'in'))).toEqual(timerType);
    expect(result.get(portKey('check', 'then'))).toEqual(timerType);
    expect(result.get(portKey('check', 'else'))).toEqual(timerType);

    // Log gets type from condition.then
    expect(result.get(portKey('log', 'in'))).toEqual(timerType);
    expect(result.get(portKey('log', 'out'))).toEqual(timerType);

    // HTTP trigger gets type from condition.else
    expect(result.get(portKey('http', 'trigger'))).toEqual(timerType);

    // HTTP concrete outputs are unchanged
    expect(result.get(portKey('http', 'response'))).toEqual(
      T.obj({ status: T.number, body: T.string })
    );
    expect(result.get(portKey('http', 'error'))).toEqual(T.obj({ message: T.string }));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Edge cases
  // ─────────────────────────────────────────────────────────────────────────

  it('handles disconnected nodes', () => {
    const nodes = [
      makeNode('a', { out: { direction: 'output', type: T.string } }),
      makeNode('b', { in: { direction: 'input', type: T.generic() } }),
    ];
    // No edges

    const result = inferTypes(nodes, []);
    expect(result.get(portKey('a', 'out'))).toEqual(T.string);
    expect(result.has(portKey('b', 'in'))).toBe(false); // generic, not resolved
  });

  it('handles empty graph', () => {
    const result = inferTypes([], []);
    expect(result.size).toBe(0);
  });

  it('handles circular connections gracefully', () => {
    const nodes = [
      makeNode('a', {
        in: { direction: 'input', type: T.generic() },
        out: { direction: 'output', type: T.passthrough('in') },
      }),
      makeNode('b', {
        in: { direction: 'input', type: T.generic() },
        out: { direction: 'output', type: T.passthrough('in') },
      }),
    ];
    const edges = [makeEdge('a', 'out', 'b', 'in'), makeEdge('b', 'out', 'a', 'in')];

    // Should not infinite loop, just leave them unresolved
    const result = inferTypes(nodes, edges);
    expect(result.has(portKey('a', 'in'))).toBe(false);
    expect(result.has(portKey('b', 'in'))).toBe(false);
  });
});
