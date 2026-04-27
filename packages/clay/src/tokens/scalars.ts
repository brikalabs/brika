/**
 * Layer 0 — Scalars
 * One knob per concern. Themes set these; everything downstream cascades.
 *
 * Definitions live in [`./scalars.data.json`](./scalars.data.json).
 * Keeping them in JSON pulls the structurally-repeating object literal
 * scaffold out of TS so Sonar's CPD doesn't flag every entry as
 * duplication. The runtime shape is identical.
 */

import SCALAR_DEFS from './scalars.data.json' with { type: 'json' };
import type { TailwindNamespace, TokenCategory, TokenSpec } from './types';

const TOKEN_CATEGORIES: ReadonlySet<TokenCategory> = new Set([
  'color',
  'geometry',
  'border',
  'typography',
  'elevation',
  'focus',
  'motion',
  'state',
]);

const TAILWIND_NAMESPACES: ReadonlySet<TailwindNamespace> = new Set([
  'color',
  'radius',
  'shadow',
  'text',
  'font',
  'motion',
  'opacity',
  'blur',
  'default',
  'none',
]);

function isCategory(value: string): value is TokenCategory {
  return (TOKEN_CATEGORIES as ReadonlySet<string>).has(value);
}

function isNamespace(value: string): value is TailwindNamespace {
  return (TAILWIND_NAMESPACES as ReadonlySet<string>).has(value);
}

interface RawScalarDef {
  readonly name: string;
  readonly category: string;
  readonly defaultLight: string;
  readonly description: string;
  readonly themePath: string;
  readonly tailwindNamespace?: string;
  readonly utilityAlias?: string;
}

function toScalar(def: RawScalarDef): TokenSpec {
  if (!isCategory(def.category)) {
    throw new Error(`[clay] invalid category in scalar "${def.name}": ${def.category}`);
  }
  let tailwindNamespace: TailwindNamespace | undefined;
  if (def.tailwindNamespace !== undefined) {
    if (!isNamespace(def.tailwindNamespace)) {
      throw new Error(
        `[clay] invalid tailwindNamespace in scalar "${def.name}": ${def.tailwindNamespace}`
      );
    }
    tailwindNamespace = def.tailwindNamespace;
  }
  return {
    name: def.name,
    layer: 'scalar',
    category: def.category,
    defaultLight: def.defaultLight,
    description: def.description,
    themePath: def.themePath,
    tailwindNamespace,
    utilityAlias: def.utilityAlias,
  };
}

export const SCALARS: readonly TokenSpec[] = SCALAR_DEFS.map(toScalar);
