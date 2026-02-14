import { type ComponentNode, MUT, type Mutation } from '@brika/ui-kit';

function hasChildren(node: ComponentNode): node is ComponentNode & { children: ComponentNode[] } {
  return 'children' in node;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a == null || b == null || typeof a !== typeof b) return false;
  return typeof a === 'object' && Bun.deepEquals(a, b);
}

function emitPropDiff(
  prev: ComponentNode,
  next: ComponentNode,
  path: string,
  out: Mutation[]
): void {
  let changes: Record<string, unknown> | null = null;
  let removed: string[] | null = null;

  const p: Record<string, unknown> = { ...prev };
  const n: Record<string, unknown> = { ...next };

  for (const k in p) {
    if (k === 'type' || k === 'children') continue;
    if (!(k in n)) {
      removed ??= [];
      removed.push(k);
    } else if (!deepEqual(p[k], n[k])) {
      changes ??= {};
      changes[k] = n[k];
    }
  }

  for (const k in n) {
    if (k === 'type' || k === 'children' || k in p) continue;
    changes ??= {};
    changes[k] = n[k];
  }

  if (changes || removed) {
    out.push(
      removed ? [MUT.UPDATE, path, changes ?? {}, removed] : [MUT.UPDATE, path, changes ?? {}]
    );
  }
}

function nodePath(base: string, i: number): string {
  return base ? `${base}.${i}` : `${i}`;
}

function walk(
  oldNodes: ComponentNode[],
  newNodes: ComponentNode[],
  basePath: string,
  out: Mutation[]
): void {
  const minLen = Math.min(oldNodes.length, newNodes.length);

  for (let i = 0; i < minLen; i++) {
    const prev = oldNodes[i];
    const next = newNodes[i];
    if (prev === next || !prev || !next) continue;

    if (prev.type !== next.type) {
      out.push([MUT.REPLACE, nodePath(basePath, i), next]);
      continue;
    }

    if (!('children' in prev) && deepEqual(prev, next)) continue;

    const path = nodePath(basePath, i);

    emitPropDiff(prev, next, path, out);

    if (hasChildren(prev) && hasChildren(next)) {
      walk(prev.children, next.children, path, out);
    }
  }

  for (let i = minLen; i < newNodes.length; i++) {
    const node = newNodes[i];
    if (node) out.push([MUT.CREATE, nodePath(basePath, i), node]);
  }

  for (let i = oldNodes.length - 1; i >= minLen; i--) {
    out.push([MUT.REMOVE, nodePath(basePath, i)]);
  }
}

export function reconcile(
  oldNodes: ComponentNode[],
  newNodes: ComponentNode[],
  basePath = ''
): Mutation[] {
  const mutations: Mutation[] = [];
  walk(oldNodes, newNodes, basePath, mutations);
  return mutations;
}
