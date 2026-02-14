import type { ComponentNode } from '@brika/ui-kit';
import { bench, group, run } from 'mitata';
import { reconcile } from '../reconciler';

type TextNode = ComponentNode & { type: 'text' };
type ColumnNode = ComponentNode & { type: 'column'; children: ComponentNode[] };

function text(content: string, extra?: Record<string, unknown>): TextNode {
  const node = { type: 'text' as const, content } as TextNode;
  if (extra) Object.assign(node, extra);
  return node;
}

function column(children: ComponentNode[]): ColumnNode {
  return { type: 'column' as const, children } as ColumnNode;
}

function flatTree(n: number, prefix = ''): ComponentNode[] {
  return Array.from({ length: n }, (_, i) => text(`${prefix}${i}`));
}

function nestedTree(depth: number, width: number, prefix = ''): ComponentNode[] {
  if (depth === 0) return [text(`${prefix}leaf`)];
  return Array.from({ length: width }, (_, i) =>
    column(nestedTree(depth - 1, width, `${prefix}${i}.`))
  );
}

function mutateProps(nodes: ComponentNode[], frac: number): ComponentNode[] {
  return nodes.map((node, i) => {
    if (i / nodes.length < frac) return { ...node, content: `changed-${i}` } as ComponentNode;
    if ('children' in node) {
      const n = node as ColumnNode;
      return { ...n, children: mutateProps(n.children, frac) } as ComponentNode;
    }
    return node;
  });
}

const flat100 = flatTree(100);
const nested3x4 = nestedTree(3, 4);
const flat50old = flatTree(50, 'old-');
const flat50new = flatTree(50, 'new-');
const flat200 = flatTree(200);
const flat200partial = mutateProps(flatTree(200), 0.1);
const base20 = flatTree(20);
const appended30 = [...flatTree(20), ...flatTree(10, 'new-')];
const deep4x3old = nestedTree(4, 3);
const deep4x3new = mutateProps(nestedTree(4, 3), 0.2);
const large500a = flatTree(500);
const large500b = flatTree(500);
const mixedOld: ComponentNode[] = [
  text('keep'),
  text('change'),
  text('remove1'),
  text('remove2'),
  column([text('nested-keep'), text('nested-change')]),
];
const mixedNew: ComponentNode[] = [
  text('keep'),
  text('CHANGED'),
  column([text('nested-keep'), text('NESTED-CHANGED'), text('nested-add')]),
  text('added'),
];

group('identical trees', () => {
  bench('flat 100 nodes', () => reconcile(flat100, flat100));
  bench('nested 3x4', () => reconcile(nested3x4, nested3x4));
});

group('prop changes', () => {
  bench('all changed flat 50', () => reconcile(flat50old, flat50new));
  bench('10% changed flat 200', () => reconcile(flat200, flat200partial));
});

group('structural changes', () => {
  bench('append 10 (20->30)', () => reconcile(base20, appended30));
  bench('remove 10 (30->20)', () => reconcile(appended30, base20));
});

group('deep trees', () => {
  bench('20% changed nested 4x3', () => reconcile(deep4x3old, deep4x3new));
  bench('structurally equal flat 500', () => reconcile(large500a, large500b));
});

bench('mixed ops', () => reconcile(mixedOld, mixedNew));

await run();
