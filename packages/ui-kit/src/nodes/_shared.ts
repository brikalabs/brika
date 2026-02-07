/** Base fields shared by all component nodes */
export interface BaseNode {
  type: string;
}

/** Extensible map — each node file self-registers via declaration merging */
export interface NodeTypeMap {}

/** Discriminated union — auto-derived, never needs manual updates */
export type ComponentNode = NodeTypeMap[keyof NodeTypeMap];

/** Child type for JSX container components */
export type Child = ComponentNode | ComponentNode[] | false | null | undefined;

/** Flatten & filter JSX children into a clean ComponentNode array */
export function normalizeChildren(children: Child | Child[]): ComponentNode[] {
  if (!children) return [];
  if (!Array.isArray(children)) return [children as ComponentNode];
  return (children as unknown[]).flat(Infinity).filter(Boolean) as ComponentNode[];
}
