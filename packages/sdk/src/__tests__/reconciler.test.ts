/**
 * Tests for reconcile (tree diffing)
 */

import { describe, expect, test } from 'bun:test';
import type { ButtonNode, ChartNode, ComponentNode, StackNode, TextNode } from '@brika/ui-kit';
import { reconcile } from '../reconciler';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Create a text node, optionally with extra arbitrary props for edge-case tests. */
const text = (content: string, extra?: Record<string, unknown>): TextNode => {
  const node: TextNode = { type: 'text', content };
  if (extra) Object.assign(node, extra);
  return node;
};

const stack = (children: ComponentNode[], direction: 'horizontal' | 'vertical' = 'vertical'): StackNode =>
  ({ type: 'stack', direction, children });

const chart = (data: ChartNode['data']): ChartNode =>
  ({ type: 'chart', variant: 'line', data });

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('reconcile', () => {
  describe('identical trees', () => {
    test('produces empty mutations for same nodes', () => {
      const nodes = [text('Hello')];
      const mutations = reconcile(nodes, nodes);
      expect(mutations).toEqual([]);
    });

    test('produces empty mutations for structurally equal nodes', () => {
      const mutations = reconcile([text('A')], [text('A')]);
      expect(mutations).toEqual([]);
    });
  });

  describe('node addition', () => {
    test('produces create mutation for new node', () => {
      const mutations = reconcile([], [text('New')]);

      expect(mutations).toHaveLength(1);
      expect(mutations[0].op).toBe('create');
      expect(mutations[0].path).toBe('0');
      expect(mutations[0]).toHaveProperty('node.content', 'New');
    });

    test('produces create for appended node', () => {
      const mutations = reconcile([text('A')], [text('A'), text('B')]);

      expect(mutations).toHaveLength(1);
      expect(mutations[0].op).toBe('create');
      expect(mutations[0].path).toBe('1');
    });
  });

  describe('node removal', () => {
    test('produces remove mutation for deleted node', () => {
      const mutations = reconcile([text('A')], []);

      expect(mutations).toHaveLength(1);
      expect(mutations[0].op).toBe('remove');
      expect(mutations[0].path).toBe('0');
    });

    test('produces remove for trailing node', () => {
      const mutations = reconcile([text('A'), text('B')], [text('A')]);

      expect(mutations).toHaveLength(1);
      expect(mutations[0].op).toBe('remove');
      expect(mutations[0].path).toBe('1');
    });

    test('removes multiple trailing nodes in reverse order', () => {
      const mutations = reconcile(
        [text('A'), text('B'), text('C')],
        [text('A')],
      );

      // Two removes, highest index first so sequential application works
      expect(mutations).toHaveLength(2);
      expect(mutations[0]).toEqual({ op: 'remove', path: '2' });
      expect(mutations[1]).toEqual({ op: 'remove', path: '1' });
    });

    test('replace + trailing removes produces correct result when applied', () => {
      const button: ButtonNode = { type: 'button', label: 'X' };
      const oldNodes = [text('A'), text('B'), text('C')];
      const newNodes: ComponentNode[] = [button];

      const mutations = reconcile(oldNodes, newNodes);

      // Apply mutations sequentially and verify correct result
      let result = [...oldNodes];
      for (const m of mutations) {
        const idx = Number(m.path);
        if (m.op === 'remove') {
          result = result.filter((_, i) => i !== idx);
        } else if (m.op === 'replace') {
          result[idx] = m.node;
        } else if (m.op === 'create') {
          if (idx >= result.length) result.push(m.node);
          else result.splice(idx, 0, m.node);
        }
      }
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(button);
    });
  });

  describe('prop changes', () => {
    test('produces update with only changed props', () => {
      const mutations = reconcile(
        [text('Old', { variant: 'body' })],
        [text('New', { variant: 'body' })],
      );

      expect(mutations).toHaveLength(1);
      expect(mutations[0].op).toBe('update');
      expect(mutations[0].path).toBe('0');
      expect(mutations[0]).toHaveProperty('props', { content: 'New' });
    });

    test('detects multiple changed props', () => {
      const mutations = reconcile(
        [text('A', { variant: 'body', color: '#000' })],
        [text('B', { variant: 'heading', color: '#000' })],
      );

      expect(mutations).toHaveLength(1);
      expect(mutations[0]).toHaveProperty('props.content', 'B');
      expect(mutations[0]).toHaveProperty('props.variant', 'heading');
      expect(mutations[0]).not.toHaveProperty('props.color'); // unchanged, not included
    });
  });

  describe('type change', () => {
    test('produces replace when type changes', () => {
      const button: ButtonNode = { type: 'button', label: 'Click' };
      const mutations = reconcile([text('A')], [button]);

      expect(mutations).toHaveLength(1);
      expect(mutations[0].op).toBe('replace');
      expect(mutations[0].path).toBe('0');
      expect(mutations[0]).toHaveProperty('node.type', 'button');
    });
  });

  describe('nested children', () => {
    test('diffs children recursively with correct paths', () => {
      const oldTree = [stack([text('A'), text('B')])];
      const newTree = [stack([text('A'), text('C')])];

      const mutations = reconcile(oldTree, newTree);

      expect(mutations).toHaveLength(1);
      expect(mutations[0].op).toBe('update');
      expect(mutations[0].path).toBe('0.1');
      expect(mutations[0]).toHaveProperty('props', { content: 'C' });
    });

    test('detects added child in container', () => {
      const oldTree = [stack([text('A')])];
      const newTree = [stack([text('A'), text('B')])];

      const mutations = reconcile(oldTree, newTree);

      expect(mutations).toHaveLength(1);
      expect(mutations[0].op).toBe('create');
      expect(mutations[0].path).toBe('0.1');
    });

    test('detects removed child in container', () => {
      const oldTree = [stack([text('A'), text('B')])];
      const newTree = [stack([text('A')])];

      const mutations = reconcile(oldTree, newTree);

      expect(mutations).toHaveLength(1);
      expect(mutations[0].op).toBe('remove');
      expect(mutations[0].path).toBe('0.1');
    });

    test('handles deeply nested paths', () => {
      const oldTree = [stack([stack([text('deep')])])];
      const newTree = [stack([stack([text('deeper')])])];

      const mutations = reconcile(oldTree, newTree);

      expect(mutations).toHaveLength(1);
      expect(mutations[0].path).toBe('0.0.0');
      expect(mutations[0]).toHaveProperty('props', { content: 'deeper' });
    });
  });

  describe('diffProps edge cases', () => {
    test('detects array value changes', () => {
      const old = [chart([{ ts: 1, value: 1 }, { ts: 2, value: 2 }, { ts: 3, value: 3 }])];
      const next = [chart([{ ts: 1, value: 1 }, { ts: 2, value: 2 }, { ts: 3, value: 4 }])];

      const mutations = reconcile(old, next);

      expect(mutations).toHaveLength(1);
      expect(mutations[0].op).toBe('update');
      expect(mutations[0]).toHaveProperty('props.data', [{ ts: 1, value: 1 }, { ts: 2, value: 2 }, { ts: 3, value: 4 }]);
    });

    test('detects object value changes', () => {
      const old = [text('A', { style: { bold: true } })];
      const next = [text('A', { style: { bold: false } })];

      const mutations = reconcile(old, next);

      expect(mutations).toHaveLength(1);
      expect(mutations[0]).toHaveProperty('props.style', { bold: false });
    });

    test('detects added and removed props', () => {
      const old = [text('A', { color: 'red' })];
      const next = [text('A', { variant: 'heading' })];

      const mutations = reconcile(old, next);

      expect(mutations).toHaveLength(1);
      expect(mutations[0]).toHaveProperty('props.variant', 'heading');
      expect(mutations[0]).not.toHaveProperty('props.color'); // not in props — it's in removed
      expect(mutations[0]).toHaveProperty('removed', ['color']);
    });

    test('treats null and undefined as different', () => {
      const old = [text('A', { color: null })];
      const next = [text('A')];

      const mutations = reconcile(old, next);
      expect(mutations).toHaveLength(1);
      expect(mutations[0]).toHaveProperty('removed', ['color']);
    });
  });

  describe('empty trees', () => {
    test('both empty produces no mutations', () => {
      expect(reconcile([], [])).toEqual([]);
    });
  });

  // ─── sentBody / pendingBody debounce correctness ─────────────────
  // These tests verify the pattern used by the brick runtime:
  // always diff against what was actually sent (sentBody), not intermediate renders.

  describe('debounced diff correctness (sentBody pattern)', () => {
    /**
     * Apply mutations to a tree (simulates what the hub does).
     */
    function applyMutations(tree: ComponentNode[], mutations: ReturnType<typeof reconcile>): ComponentNode[] {
      const result = [...tree];
      for (const m of mutations) {
        const parts = m.path.split('.');
        if (parts.length === 1) {
          const idx = Number(parts[0]);
          if (m.op === 'remove') {
            result.splice(idx, 1);
          } else if (m.op === 'replace') {
            result[idx] = m.node;
          } else if (m.op === 'create') {
            result.splice(idx, 0, m.node);
          } else if (m.op === 'update') {
            const node = { ...result[idx] } as unknown as Record<string, unknown>;
            for (const [k, v] of Object.entries(m.props)) node[k] = v;
            if (m.removed) for (const k of m.removed) delete node[k];
            result[idx] = node as unknown as ComponentNode;
          }
        }
      }
      return result;
    }

    test('diff against sentBody produces correct mutations after debounced renders', () => {
      // Simulates: render1 → render2 → render3, only the last diff is sent
      const sentBody: ComponentNode[] = [text('A')];

      // Three rapid renders produce different trees — only the final one matters
      // intermediate: [text('B')], [text('C')]
      const finalBody = [text('D')];

      // Correct: diff against sentBody (what hub has)
      const mutations = reconcile(sentBody, finalBody);
      const hubState = applyMutations(sentBody, mutations);

      expect(hubState).toEqual([text('D')]);
    });

    test('diffing against intermediate state (the old bug) produces wrong result', () => {
      // Demonstrates the bug that existed before the sentBody fix
      const sentBody: ComponentNode[] = [text('A'), text('B')];

      // Render 1: remove node B → [text('A')]
      const intermediate = [text('A')];
      // Render 2: change A to C, add D → [text('C'), text('D')]
      const finalBody = [text('C'), text('D')];

      // OLD BUG: diff finalBody against intermediate (hub never received)
      // Produces: update 0 (A→C), create 1 (D)
      // But hub still has [A, B]! create 1 inserts D before B → [C, D, B] — WRONG
      void reconcile(intermediate, finalBody);

      // CORRECT: diff finalBody against sentBody (what hub actually has)
      const correctMutations = reconcile(sentBody, finalBody);
      const hubState = applyMutations([...sentBody], correctMutations);

      expect(hubState).toEqual([text('C'), text('D')]);
    });

    test('multiple prop changes coalesce correctly when diffed against sentBody', () => {
      const sentBody: ComponentNode[] = [text('hello', { variant: 'body', color: '#000' })];

      // Rapid renders change different props — only the final tree matters
      // intermediate: variant→heading, then content→world
      const finalBody = [text('world', { variant: 'heading', color: '#f00' })];

      // Final diff captures ALL changes from sentBody
      const mutations = reconcile(sentBody, finalBody);

      expect(mutations).toHaveLength(1);
      expect(mutations[0]!.op).toBe('update');
      expect(mutations[0]).toHaveProperty('props.content', 'world');
      expect(mutations[0]).toHaveProperty('props.variant', 'heading');
      expect(mutations[0]).toHaveProperty('props.color', '#f00');
    });

    test('structural changes (add/remove) are correct against sentBody', () => {
      const sentBody: ComponentNode[] = [text('A'), text('B'), text('C')];

      // Many intermediate renders, final result removes B and changes C
      const finalBody: ComponentNode[] = [text('A'), text('C-updated')];

      const mutations = reconcile(sentBody, finalBody);
      const hubState = applyMutations([...sentBody], mutations);

      expect(hubState).toEqual([text('A'), text('C-updated')]);
    });
  });
});
