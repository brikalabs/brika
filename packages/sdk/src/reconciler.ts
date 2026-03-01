import { type ComponentNode, MUT, type Mutation } from '@brika/ui-kit';

function hasChildren(node: ComponentNode): node is ComponentNode & {
  children: ComponentNode[];
} {
  return 'children' in node;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (a === null || b === null || typeof a !== typeof b) {
    return false;
  }
  return typeof a === 'object' && Bun.deepEquals(a, b);
}

function isReservedKey(k: string): boolean {
  return k === 'type' || k === 'children';
}

function diffProps(
  p: Record<string, unknown>,
  n: Record<string, unknown>
): {
  changes: Record<string, unknown> | null;
  removed: string[] | null;
} {
  let changes: Record<string, unknown> | null = null;
  let removed: string[] | null = null;

  for (const k in p) {
    if (isReservedKey(k)) {
      continue;
    }
    if (!(k in n)) {
      removed ??= [];
      removed.push(k);
    } else if (!deepEqual(p[k], n[k])) {
      changes ??= {};
      changes[k] = n[k];
    }
  }

  for (const k in n) {
    if (isReservedKey(k) || k in p) {
      continue;
    }
    changes ??= {};
    changes[k] = n[k];
  }

  return {
    changes,
    removed,
  };
}

function emitPropDiff(
  prev: ComponentNode,
  next: ComponentNode,
  path: string,
  out: Mutation[]
): void {
  const { changes, removed } = diffProps(
    {
      ...prev,
    },
    {
      ...next,
    }
  );

  if (changes || removed) {
    out.push(
      removed ? [MUT.UPDATE, path, changes ?? {}, removed] : [MUT.UPDATE, path, changes ?? {}]
    );
  }
}

function nodePath(base: string, i: number): string {
  return base ? `${base}.${i}` : `${i}`;
}

function emitCreatesAndRemoves(
  oldLen: number,
  newNodes: ComponentNode[],
  minLen: number,
  basePath: string,
  out: Mutation[]
): void {
  for (let i = minLen; i < newNodes.length; i++) {
    const node = newNodes[i];
    if (node) {
      out.push([MUT.CREATE, nodePath(basePath, i), node]);
    }
  }
  for (let i = oldLen - 1; i >= minLen; i--) {
    out.push([MUT.REMOVE, nodePath(basePath, i)]);
  }
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
    if (prev === next || !prev || !next) {
      continue;
    }

    if (prev.type !== next.type) {
      out.push([MUT.REPLACE, nodePath(basePath, i), next]);
      continue;
    }

    if (!('children' in prev) && deepEqual(prev, next)) {
      continue;
    }

    const path = nodePath(basePath, i);
    emitPropDiff(prev, next, path, out);

    if (hasChildren(prev) && hasChildren(next)) {
      walk(prev.children, next.children, path, out);
    }
  }

  emitCreatesAndRemoves(oldNodes.length, newNodes, minLen, basePath, out);
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
