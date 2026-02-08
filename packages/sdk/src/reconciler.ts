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

    // Reference equality — same object, skip entirely
    if (prev === next) continue;

    const path = basePath ? `${basePath}.${i}` : `${i}`;

    if (prev.type !== next.type) {
      // Type changed — atomic replace (no remove+create dance)
      mutations.push({ op: 'replace', path, node: next });
    } else {
      // Same type — diff props
      const diff = diffProps(prev, next);
      if (diff) {
        mutations.push({
          op: 'update',
          path,
          props: diff.props,
          ...(diff.removed.length > 0 ? { removed: diff.removed } : {}),
        });
      }
      // Recurse into container children
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
  }

  // Appended nodes (new tree is longer)
  for (let i = minLen; i < newNodes.length; i++) {
    const path = basePath ? `${basePath}.${i}` : `${i}`;
    mutations.push({ op: 'create', path, node: newNodes[i]! });
  }

  // Removed nodes (old tree is longer) — highest index first
  for (let i = oldNodes.length - 1; i >= minLen; i--) {
    const path = basePath ? `${basePath}.${i}` : `${i}`;
    mutations.push({ op: 'remove', path });
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

/** Fast deep-ish equality for prop values (primitives, arrays, plain objects) */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!valuesEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    for (const k of aKeys) {
      if (!valuesEqual(aObj[k], bObj[k])) return false;
    }
    return true;
  }

  return false;
}
