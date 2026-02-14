import { MUT, type Mutation } from './descriptors';
import type { ComponentNode } from './nodes';

function hasChildren(node: ComponentNode): node is ComponentNode & { children: ComponentNode[] } {
  return 'children' in node;
}

function applyChanges(
  node: ComponentNode,
  changes: Record<string, unknown>,
  removed?: string[]
): ComponentNode {
  const updated = { ...node, ...changes };
  if (removed) {
    for (const k of removed) Reflect.deleteProperty(updated, k);
  }
  return updated;
}

export function applyMutations(body: ComponentNode[], mutations: Mutation[]): ComponentNode[] {
  let result = body;
  for (const m of mutations) {
    result = applyOne(result, m);
  }
  return result;
}

function applyOne(body: ComponentNode[], mutation: Mutation): ComponentNode[] {
  const segments = mutation[1].split('.').map(Number);
  return updateAtPath(body, segments, 0, mutation);
}

function updateAtPath(
  nodes: ComponentNode[],
  segments: number[],
  depth: number,
  mutation: Mutation
): ComponentNode[] {
  const idx = segments[depth] ?? 0;
  const isLeaf = depth === segments.length - 1;

  if (isLeaf) {
    switch (mutation[0]) {
      case MUT.CREATE: {
        const result = [...nodes];
        if (idx >= result.length) {
          result.push(mutation[2]);
        } else {
          result.splice(idx, 0, mutation[2]);
        }
        return result;
      }
      case MUT.REPLACE: {
        const result = [...nodes];
        result[idx] = mutation[2];
        return result;
      }
      case MUT.UPDATE: {
        const target = nodes[idx];
        if (!target) return nodes;
        const result = [...nodes];
        result[idx] = applyChanges(target, mutation[2], mutation[3]);
        return result;
      }
      case MUT.REMOVE: {
        return nodes.filter((_, i) => i !== idx);
      }
    }
  }

  const node = nodes[idx];
  if (!node || !hasChildren(node)) return nodes;

  const updatedChildren = updateAtPath(node.children, segments, depth + 1, mutation);

  const result = [...nodes];
  result[idx] = { ...node, children: updatedChildren } as ComponentNode;
  return result;
}
