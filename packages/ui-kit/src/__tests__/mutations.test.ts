/**
 * Tests for applyMutations
 */

import { describe, expect, test } from 'bun:test';
import type { ComponentNode, Mutation } from '../descriptors';
import { applyMutations } from '../mutations';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const text = (content: string): ComponentNode =>
  ({ type: 'text', content } as ComponentNode);

const stack = (children: ComponentNode[]): ComponentNode =>
  ({ type: 'stack', direction: 'vertical', children } as ComponentNode);

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
      expect((result[1] as any).content).toBe('B');
    });

    test('inserts node at index', () => {
      const body = [text('A'), text('C')];
      const result = applyMutations(body, [
        { op: 'create', path: '1', node: text('B') },
      ]);

      expect(result).toHaveLength(3);
      expect((result[0] as any).content).toBe('A');
      expect((result[1] as any).content).toBe('B');
      expect((result[2] as any).content).toBe('C');
    });

    test('inserts at beginning', () => {
      const body = [text('B')];
      const result = applyMutations(body, [
        { op: 'create', path: '0', node: text('A') },
      ]);

      expect(result).toHaveLength(2);
      expect((result[0] as any).content).toBe('A');
      expect((result[1] as any).content).toBe('B');
    });
  });

  describe('update', () => {
    test('merges props into existing node', () => {
      const body = [text('Hello')];
      const result = applyMutations(body, [
        { op: 'update', path: '0', props: { content: 'Updated' } },
      ]);

      expect((result[0] as any).content).toBe('Updated');
      expect((result[0] as any).type).toBe('text');
    });

    test('adds new props without removing existing ones', () => {
      const body = [text('Hello')];
      const result = applyMutations(body, [
        { op: 'update', path: '0', props: { variant: 'heading' } },
      ]);

      expect((result[0] as any).content).toBe('Hello');
      expect((result[0] as any).variant).toBe('heading');
    });
  });

  describe('remove', () => {
    test('removes node at index', () => {
      const body = [text('A'), text('B'), text('C')];
      const result = applyMutations(body, [
        { op: 'remove', path: '1' },
      ]);

      expect(result).toHaveLength(2);
      expect((result[0] as any).content).toBe('A');
      expect((result[1] as any).content).toBe('C');
    });

    test('removes first node', () => {
      const body = [text('A'), text('B')];
      const result = applyMutations(body, [
        { op: 'remove', path: '0' },
      ]);

      expect(result).toHaveLength(1);
      expect((result[0] as any).content).toBe('B');
    });
  });

  describe('nested paths', () => {
    test('updates a nested child', () => {
      const body = [stack([text('inner')])];
      const result = applyMutations(body, [
        { op: 'update', path: '0.0', props: { content: 'updated-inner' } },
      ]);

      const children = (result[0] as any).children;
      expect(children[0].content).toBe('updated-inner');
    });

    test('creates a nested child', () => {
      const body = [stack([text('first')])];
      const result = applyMutations(body, [
        { op: 'create', path: '0.1', node: text('second') },
      ]);

      const children = (result[0] as any).children;
      expect(children).toHaveLength(2);
      expect(children[1].content).toBe('second');
    });

    test('removes a nested child', () => {
      const body = [stack([text('A'), text('B')])];
      const result = applyMutations(body, [
        { op: 'remove', path: '0.0' },
      ]);

      const children = (result[0] as any).children;
      expect(children).toHaveLength(1);
      expect(children[0].content).toBe('B');
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
      expect((result[0] as any).children[0]).toBe(child0);
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
      expect((result[0] as any).content).toBe('A2');
      expect((result[1] as any).content).toBe('B');
      expect((result[2] as any).content).toBe('C');
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
