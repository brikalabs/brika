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

/** Type guard for container nodes (nodes that have a `children` array). */
function hasChildren(node: ComponentNode): node is ComponentNode & { children: ComponentNode[] } {
  return 'children' in node;
}

/**
 * Merge props into a node and optionally remove keys — returns a valid ComponentNode.
 * Encapsulates the unavoidable cast needed for dynamic property manipulation
 * on a discriminated union.
 */
function mergeNodeProps(
  node: ComponentNode,
  props: Record<string, unknown>,
  removed?: string[],
): ComponentNode {
  const updated: Record<string, unknown> = Object.assign({}, node, props);
  if (removed) {
    for (const k of removed) delete updated[k];
  }
  // Safe: we're merging props onto a structurally valid node
  return updated as unknown as ComponentNode;
}

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
      case 'replace': {
        const result = [...nodes];
        result[idx] = mutation.node;
        return result;
      }
      case 'update': {
        const result = [...nodes];
        result[idx] = mergeNodeProps(result[idx]!, mutation.props, mutation.removed);
        return result;
      }
      case 'remove': {
        return nodes.filter((_, i) => i !== idx);
      }
    }
  }

  // Not at leaf yet — recurse into children of the node at idx
  const node = nodes[idx];
  if (!node || !hasChildren(node)) return nodes;

  const updatedChildren = updateAtPath(
    node.children,
    segments,
    depth + 1,
    mutation,
  );

  // Structural sharing: new array, new node at idx, siblings unchanged
  // Object.assign avoids TS excess-property-check issues with discriminated union spreads
  const result = [...nodes];
  result[idx] = Object.assign({}, node, { children: updatedChildren });
  return result;
}
