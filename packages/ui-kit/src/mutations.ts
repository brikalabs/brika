/**
 * Mutation Applicator
 *
 * Applies reconciler mutations to a ComponentNode tree with structural sharing.
 * Only creates new object references along the mutation path — siblings
 * and their subtrees keep their original references.
 *
 * Shared between Hub (Bun) and UI (Browser).
 */

import type { ComponentNode, Mutation } from './descriptors';

/** Apply a batch of mutations to a component tree, returning a new tree with structural sharing. */
export function applyMutations(body: ComponentNode[], mutations: Mutation[]): ComponentNode[] {
  let result = body;
  for (const m of mutations) {
    result = applyOne(result, m);
  }
  return result;
}

function applyOne(body: ComponentNode[], mutation: Mutation): ComponentNode[] {
  const segments = mutation.path.split('.').map(Number);
  return updateAtPath(body, segments, 0, mutation);
}

function updateAtPath(
  nodes: ComponentNode[],
  segments: number[],
  depth: number,
  mutation: Mutation,
): ComponentNode[] {
  const idx = segments[depth]!;
  const isLeaf = depth === segments.length - 1;

  if (isLeaf) {
    switch (mutation.op) {
      case 'create': {
        const result = [...nodes];
        if (idx >= result.length) {
          result.push(mutation.node);
        } else {
          result.splice(idx, 0, mutation.node);
        }
        return result;
      }
      case 'update': {
        const result = [...nodes];
        result[idx] = { ...result[idx], ...mutation.props } as ComponentNode;
        return result;
      }
      case 'remove': {
        return nodes.filter((_, i) => i !== idx);
      }
    }
  }

  // Not at leaf yet — recurse into children of the node at idx
  const node = nodes[idx] as ComponentNode | undefined;
  if (!node || !('children' in node)) return nodes;

  const updatedChildren = updateAtPath(
    (node as { children: ComponentNode[] }).children,
    segments,
    depth + 1,
    mutation,
  );

  // Structural sharing: new array, new node at idx, siblings unchanged
  const result = [...nodes];
  result[idx] = { ...node!, children: updatedChildren } as ComponentNode;
  return result;
}
