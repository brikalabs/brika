/**
 * Custom JSX Runtime for BRIKA Card Descriptors
 *
 * Enables Raycast-style JSX DX in plugins:
 *
 *   ctx.update(
 *     <>
 *       <Section title="Status">
 *         <Stat label="Temp" value={21} unit="°C" />
 *       </Section>
 *       <Toggle label="Heat" checked={on} onToggle="toggle" />
 *     </>
 *   );
 *
 * This is NOT React — JSX compiles to plain ComponentNode descriptors.
 * Configure with: { "jsx": "react-jsx", "jsxImportSource": "@brika/ui-kit" }
 */

import type { ComponentNode } from './descriptors';

// ─────────────────────────────────────────────────────────────────────────────
// JSX Factory
// ─────────────────────────────────────────────────────────────────────────────

type NodeOrNodes = ComponentNode | ComponentNode[];

export function jsx(
  type: ((props: Record<string, unknown>) => NodeOrNodes) | typeof Fragment,
  props: Record<string, unknown>,
  _key?: string,
): NodeOrNodes {
  return (type as (props: Record<string, unknown>) => NodeOrNodes)(props);
}

export const jsxs = jsx;

// ─────────────────────────────────────────────────────────────────────────────
// Fragment
// ─────────────────────────────────────────────────────────────────────────────

export function Fragment(props: { children?: NodeOrNodes | (NodeOrNodes | false | null | undefined)[] }): ComponentNode[] {
  const { children } = props;
  if (!children && children !== 0) return [];
  if (!Array.isArray(children)) return [children as ComponentNode];
  return (children as unknown[]).flat(Infinity).filter(Boolean) as ComponentNode[];
}

// ─────────────────────────────────────────────────────────────────────────────
// JSX Type Declarations
// ─────────────────────────────────────────────────────────────────────────────

export namespace JSX {
  export type Element = ComponentNode | ComponentNode[];
  export interface ElementChildrenAttribute {
    children: {};
  }
  export interface IntrinsicElements {}
}
