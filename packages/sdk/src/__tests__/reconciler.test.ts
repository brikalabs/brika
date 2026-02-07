/**
 * Tests for reconcile (tree diffing)
 */

import { describe, expect, test } from 'bun:test';
import type { ComponentNode } from '@brika/ui-kit';
import { reconcile } from '../reconciler';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const text = (content: string, extra?: Record<string, unknown>): ComponentNode =>
  ({ type: 'text', content, ...extra } as ComponentNode);

const stack = (children: ComponentNode[], direction = 'vertical' as const): ComponentNode =>
  ({ type: 'stack', direction, children } as ComponentNode);

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
      expect((mutations[0] as any).node.content).toBe('New');
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
      expect((mutations[0] as any).props).toEqual({ content: 'New' });
    });

    test('detects multiple changed props', () => {
      const mutations = reconcile(
        [text('A', { variant: 'body', color: '#000' })],
        [text('B', { variant: 'heading', color: '#000' })],
      );

      expect(mutations).toHaveLength(1);
      const props = (mutations[0] as any).props;
      expect(props.content).toBe('B');
      expect(props.variant).toBe('heading');
      expect(props.color).toBeUndefined(); // unchanged, not included
    });
  });

  describe('type change', () => {
    test('produces remove + create when type changes', () => {
      const button = { type: 'button', label: 'Click' } as ComponentNode;
      const mutations = reconcile([text('A')], [button]);

      expect(mutations).toHaveLength(2);
      expect(mutations[0].op).toBe('remove');
      expect(mutations[0].path).toBe('0');
      expect(mutations[1].op).toBe('create');
      expect(mutations[1].path).toBe('0');
      expect((mutations[1] as any).node.type).toBe('button');
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
      expect((mutations[0] as any).props).toEqual({ content: 'C' });
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
      expect((mutations[0] as any).props).toEqual({ content: 'deeper' });
    });
  });

  describe('diffProps edge cases', () => {
    test('detects array value changes', () => {
      const old = [{ type: 'chart', data: [1, 2, 3] } as ComponentNode];
      const next = [{ type: 'chart', data: [1, 2, 4] } as ComponentNode];

      const mutations = reconcile(old, next);

      expect(mutations).toHaveLength(1);
      expect(mutations[0].op).toBe('update');
      expect((mutations[0] as any).props.data).toEqual([1, 2, 4]);
    });

    test('detects object value changes', () => {
      const old = [{ type: 'text', content: 'A', style: { bold: true } } as ComponentNode];
      const next = [{ type: 'text', content: 'A', style: { bold: false } } as ComponentNode];

      const mutations = reconcile(old, next);

      expect(mutations).toHaveLength(1);
      expect((mutations[0] as any).props.style).toEqual({ bold: false });
    });

    test('detects added and removed props', () => {
      const old = [{ type: 'text', content: 'A', color: 'red' } as ComponentNode];
      const next = [{ type: 'text', content: 'A', variant: 'heading' } as ComponentNode];

      const mutations = reconcile(old, next);

      expect(mutations).toHaveLength(1);
      const props = (mutations[0] as any).props;
      expect(props.color).toBeUndefined();
      expect(props.variant).toBe('heading');
    });

    test('treats null and undefined as different', () => {
      const old = [{ type: 'text', content: 'A', color: null } as unknown as ComponentNode];
      const next = [{ type: 'text', content: 'A' } as ComponentNode];

      const mutations = reconcile(old, next);
      // null vs undefined — should detect a change
      expect(mutations.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('empty trees', () => {
    test('both empty produces no mutations', () => {
      expect(reconcile([], [])).toEqual([]);
    });
  });
});
