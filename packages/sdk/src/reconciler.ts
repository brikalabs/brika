/**
 * Card Tree Reconciler
 *
 * Diffs old/new ComponentNode trees and produces mutations.
 * Only changed props are sent over IPC — not the full tree.
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
  const maxLen = Math.max(oldNodes.length, newNodes.length);

  for (let i = 0; i < maxLen; i++) {
    const path = basePath ? `${basePath}.${i}` : `${i}`;
    const prev = oldNodes[i];
    const next = newNodes[i];

    if (!prev && next) {
      mutations.push({ op: 'create', path, node: next });
    } else if (prev && !next) {
      mutations.push({ op: 'remove', path });
    } else if (prev && next) {
      if (prev.type !== next.type) {
        // Type changed — replace entirely
        mutations.push({ op: 'remove', path });
        mutations.push({ op: 'create', path, node: next });
      } else {
        // Same type — diff props
        const changed = diffProps(prev, next);
        if (changed) {
          mutations.push({ op: 'update', path, props: changed });
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
  }

  return mutations;
}

/**
 * Compare two nodes of the same type and return only the changed props.
 * Returns null if nothing changed.
 */
function diffProps(
  prev: ComponentNode,
  next: ComponentNode,
): Record<string, unknown> | null {
  let changed: Record<string, unknown> | null = null;
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
      if (!changed) changed = {};
      changed[key] = b;
    }
  }

  return changed;
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
