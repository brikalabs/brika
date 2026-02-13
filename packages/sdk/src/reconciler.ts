/**
 * Brick Tree Reconciler
 *
 * Diffs old/new ComponentNode trees and produces mutations.
 * Only changed props are sent over IPC — not the full tree.
 *
 * Mutation ordering guarantees:
 *  1. updates / replaces / creates  — emitted in index order
 *  2. trailing removes              — emitted highest-index-first
 *     so sequential application never shifts indices that still need processing.
 */

import type { ComponentNode, Mutation } from '@brika/ui-kit';

function nodePath(basePath: string, index: number): string {
  return basePath ? `${basePath}.${index}` : `${index}`;
}

function diffMatchedNode(
  prev: ComponentNode,
  next: ComponentNode,
  path: string,
  basePath: string,
  mutations: Mutation[],
): void {
  if (prev.type !== next.type) {
    mutations.push({ op: 'replace', path, node: next });
    return;
  }

  const diff = diffProps(prev, next);
  if (diff) {
    mutations.push({
      op: 'update',
      path,
      props: diff.props,
      ...(diff.removed.length > 0 ? { removed: diff.removed } : {}),
    });
  }

  if ('children' in prev && 'children' in next) {
    const childMuts = reconcile(
      prev.children as ComponentNode[],
      next.children as ComponentNode[],
      path,
    );
    if (childMuts.length > 0) {
      mutations.push(...childMuts);
    }
  }
}

/**
 * Diff two component node trees and return a list of mutations.
 * Paths use dot-separated indices: "0" → body[0], "2.0" → body[2].children[0].
 */
export function reconcile(
  oldNodes: ComponentNode[],
  newNodes: ComponentNode[],
  basePath = '',
): Mutation[] {
  const mutations: Mutation[] = [];
  const minLen = Math.min(oldNodes.length, newNodes.length);

  for (let i = 0; i < minLen; i++) {
    const prev = oldNodes[i]!;
    const next = newNodes[i]!;
    if (prev === next) continue;
    diffMatchedNode(prev, next, nodePath(basePath, i), basePath, mutations);
  }

  for (let i = minLen; i < newNodes.length; i++) {
    mutations.push({ op: 'create', path: nodePath(basePath, i), node: newNodes[i]! });
  }

  for (let i = oldNodes.length - 1; i >= minLen; i--) {
    mutations.push({ op: 'remove', path: nodePath(basePath, i) });
  }

  return mutations;
}

/**
 * Compare two nodes of the same type and return changed + removed props.
 * Returns null if nothing changed.
 */
function diffProps(
  prev: ComponentNode,
  next: ComponentNode,
): { props: Record<string, unknown>; removed: string[] } | null {
  let props: Record<string, unknown> | null = null;
  const removed: string[] = [];
  const prevObj = prev as unknown as Record<string, unknown>;
  const nextObj = next as unknown as Record<string, unknown>;

  // Collect all keys from both (excluding type and children which are handled separately)
  const keys = new Set<string>();
  for (const k of Object.keys(prevObj)) keys.add(k);
  for (const k of Object.keys(nextObj)) keys.add(k);
  keys.delete('type');
  keys.delete('children');

  for (const key of keys) {
    const a = prevObj[key];
    const b = nextObj[key];

    if (!valuesEqual(a, b)) {
      if (b === undefined) {
        removed.push(key);
      } else {
        if (!props) props = {};
        props[key] = b;
      }
    }
  }

  if (!props && removed.length === 0) return null;
  return { props: props ?? {}, removed };
}

function arraysEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!valuesEqual(a[i], b[i])) return false;
  }
  return true;
}

function objectsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  for (const k of aKeys) {
    if (!valuesEqual(a[k], b[k])) return false;
  }
  return true;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a)) {
    return Array.isArray(b) && arraysEqual(a, b);
  }

  if (typeof a === 'object') {
    return objectsEqual(
      a as Record<string, unknown>,
      b as Record<string, unknown>,
    );
  }

  return false;
}
