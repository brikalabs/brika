/**
 * Tests for applyMutations
 */

import { describe, expect, test } from 'bun:test';
import type { BoxNode, ButtonNode, ComponentNode, Mutation, StackNode, TextNode } from '../descriptors';
import { applyMutations } from '../mutations';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const text = (content: string): TextNode => ({ type: 'text', content });

const stack = (children: ComponentNode[]): StackNode => ({ type: 'stack', direction: 'vertical', children });

/** Extract children from a container node at a given index in the result array. */
function childrenAt(nodes: ComponentNode[], index: number): ComponentNode[] {
  const node = nodes[index];
  if (node && 'children' in node) return node.children;
  throw new Error(`Node at index ${index} has no children`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('applyMutations', () => {
  describe('create', () => {
    test('appends node when index >= length', () => {
      const body = [text('A')];
      const result = applyMutations(body, [
        { op: 'create', path: '1', node: text('B') },
      ]);

      expect(result).toHaveLength(2);
      expect(result[1]).toHaveProperty('content', 'B');
    });

    test('inserts node at index', () => {
      const body = [text('A'), text('C')];
      const result = applyMutations(body, [
        { op: 'create', path: '1', node: text('B') },
      ]);

      expect(result).toHaveLength(3);
      expect(result[0]).toHaveProperty('content', 'A');
      expect(result[1]).toHaveProperty('content', 'B');
      expect(result[2]).toHaveProperty('content', 'C');
    });

    test('inserts at beginning', () => {
      const body = [text('B')];
      const result = applyMutations(body, [
        { op: 'create', path: '0', node: text('A') },
      ]);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('content', 'A');
      expect(result[1]).toHaveProperty('content', 'B');
    });
  });

  describe('replace', () => {
    test('replaces node at index in-place', () => {
      const button: ButtonNode = { type: 'button', label: 'Click' };
      const body = [text('A'), text('B')];
      const result = applyMutations(body, [
        { op: 'replace', path: '0', node: button },
      ]);

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(button);
      expect(result[1]).toHaveProperty('content', 'B');
    });
  });

  describe('update', () => {
    test('merges props into existing node', () => {
      const body = [text('Hello')];
      const result = applyMutations(body, [
        { op: 'update', path: '0', props: { content: 'Updated' } },
      ]);

      expect(result[0]).toHaveProperty('content', 'Updated');
      expect(result[0]).toHaveProperty('type', 'text');
    });

    test('adds new props without removing existing ones', () => {
      const body = [text('Hello')];
      const result = applyMutations(body, [
        { op: 'update', path: '0', props: { variant: 'heading' } },
      ]);

      expect(result[0]).toHaveProperty('content', 'Hello');
      expect(result[0]).toHaveProperty('variant', 'heading');
    });

    test('removes props listed in removed array', () => {
      const box: BoxNode = { type: 'box', blur: 'sm', padding: 'lg', children: [] };
      const result = applyMutations([box], [
        { op: 'update', path: '0', props: {}, removed: ['blur'] },
      ]);

      expect(result[0]).not.toHaveProperty('blur');
      expect(result[0]).toHaveProperty('padding', 'lg');
    });

    test('preserves null as a legitimate prop value', () => {
      const body = [text('Hello')];
      const result = applyMutations(body, [
        { op: 'update', path: '0', props: { color: null } },
      ]);

      expect(result[0]).toHaveProperty('color', null);
    });
  });

  describe('remove', () => {
    test('removes node at index', () => {
      const body = [text('A'), text('B'), text('C')];
      const result = applyMutations(body, [
        { op: 'remove', path: '1' },
      ]);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('content', 'A');
      expect(result[1]).toHaveProperty('content', 'C');
    });

    test('removes first node', () => {
      const body = [text('A'), text('B')];
      const result = applyMutations(body, [
        { op: 'remove', path: '0' },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('content', 'B');
    });
  });

  describe('nested paths', () => {
    test('updates a nested child', () => {
      const body = [stack([text('inner')])];
      const result = applyMutations(body, [
        { op: 'update', path: '0.0', props: { content: 'updated-inner' } },
      ]);

      const children = childrenAt(result, 0);
      expect(children[0]).toHaveProperty('content', 'updated-inner');
    });

    test('creates a nested child', () => {
      const body = [stack([text('first')])];
      const result = applyMutations(body, [
        { op: 'create', path: '0.1', node: text('second') },
      ]);

      const children = childrenAt(result, 0);
      expect(children).toHaveLength(2);
      expect(children[1]).toHaveProperty('content', 'second');
    });

    test('removes a nested child', () => {
      const body = [stack([text('A'), text('B')])];
      const result = applyMutations(body, [
        { op: 'remove', path: '0.0' },
      ]);

      const children = childrenAt(result, 0);
      expect(children).toHaveLength(1);
      expect(children[0]).toHaveProperty('content', 'B');
    });
  });

  describe('structural sharing', () => {
    test('siblings keep original references after update', () => {
      const a = text('A');
      const b = text('B');
      const body = [a, b];

      const result = applyMutations(body, [
        { op: 'update', path: '0', props: { content: 'A2' } },
      ]);

      // Updated node is a new reference
      expect(result[0]).not.toBe(a);
      // Sibling keeps original reference
      expect(result[1]).toBe(b);
    });

    test('parent is new reference but sibling subtrees are shared', () => {
      const child0 = text('unchanged');
      const child1 = text('will-change');
      const body = [stack([child0, child1])];

      const result = applyMutations(body, [
        { op: 'update', path: '0.1', props: { content: 'changed' } },
      ]);

      // Parent container is a new reference
      expect(result[0]).not.toBe(body[0]);
      // Unchanged sibling keeps reference
      expect(childrenAt(result, 0)[0]).toBe(child0);
    });
  });

  describe('batch mutations', () => {
    test('applies multiple mutations in sequence', () => {
      const body = [text('A')];
      const mutations: Mutation[] = [
        { op: 'create', path: '1', node: text('B') },
        { op: 'create', path: '2', node: text('C') },
        { op: 'update', path: '0', props: { content: 'A2' } },
      ];

      const result = applyMutations(body, mutations);

      expect(result).toHaveLength(3);
      expect(result[0]).toHaveProperty('content', 'A2');
      expect(result[1]).toHaveProperty('content', 'B');
      expect(result[2]).toHaveProperty('content', 'C');
    });
  });

  describe('edge cases', () => {
    test('empty mutations returns same array', () => {
      const body = [text('A')];
      const result = applyMutations(body, []);
      expect(result).toBe(body);
    });

    test('returns nodes unchanged when targeting non-existent nested path on leaf', () => {
      const body = [text('leaf')];
      // text node has no children, so path "0.0" should return nodes unchanged
      const result = applyMutations(body, [
        { op: 'update', path: '0.0', props: { content: 'nope' } },
      ]);
      expect(result).toBe(body);
    });
  });
});
