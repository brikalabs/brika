/**
 * TypeDescriptor — serializable, structural type representation.
 *
 * This is the single source of truth for port types across the entire system.
 * Both backend and frontend work with the same representation.
 * JSON-serializable, works over IPC.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Type Descriptor
// ─────────────────────────────────────────────────────────────────────────────

export type PrimitiveType = 'string' | 'number' | 'boolean' | 'null';

export type TypeDescriptor =
  | { readonly kind: 'primitive'; readonly type: PrimitiveType }
  | { readonly kind: 'literal'; readonly value: string | number | boolean }
  | {
      readonly kind: 'object';
      readonly fields: Record<
        string,
        { readonly type: TypeDescriptor; readonly optional: boolean }
      >;
    }
  | { readonly kind: 'array'; readonly element: TypeDescriptor }
  | { readonly kind: 'tuple'; readonly elements: readonly TypeDescriptor[] }
  | { readonly kind: 'union'; readonly variants: readonly TypeDescriptor[] }
  | { readonly kind: 'record'; readonly value: TypeDescriptor }
  | { readonly kind: 'enum'; readonly values: readonly (string | number)[] }
  | { readonly kind: 'any' }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'generic'; readonly typeVar: string }
  | { readonly kind: 'passthrough'; readonly sourcePortId: string }
  | { readonly kind: 'resolved'; readonly source: string; readonly configField: string };

// ─────────────────────────────────────────────────────────────────────────────
// Constructors — shorthand factories for readable code
// ─────────────────────────────────────────────────────────────────────────────

export const T = {
  string: { kind: 'primitive', type: 'string' } as TypeDescriptor,
  number: { kind: 'primitive', type: 'number' } as TypeDescriptor,
  boolean: { kind: 'primitive', type: 'boolean' } as TypeDescriptor,
  null: { kind: 'primitive', type: 'null' } as TypeDescriptor,
  any: { kind: 'any' } as TypeDescriptor,
  unknown: { kind: 'unknown' } as TypeDescriptor,

  literal(value: string | number | boolean): TypeDescriptor {
    return { kind: 'literal', value };
  },

  object(fields: Record<string, { type: TypeDescriptor; optional: boolean }>): TypeDescriptor {
    return { kind: 'object', fields };
  },

  /** Shorthand: all fields required */
  obj(fields: Record<string, TypeDescriptor>): TypeDescriptor {
    const mapped: Record<string, { type: TypeDescriptor; optional: boolean }> = {};
    for (const [k, v] of Object.entries(fields)) {
      mapped[k] = { type: v, optional: false };
    }
    return { kind: 'object', fields: mapped };
  },

  array(element: TypeDescriptor): TypeDescriptor {
    return { kind: 'array', element };
  },

  tuple(elements: TypeDescriptor[]): TypeDescriptor {
    return { kind: 'tuple', elements };
  },

  union(variants: TypeDescriptor[]): TypeDescriptor {
    return { kind: 'union', variants };
  },

  record(value: TypeDescriptor): TypeDescriptor {
    return { kind: 'record', value };
  },

  enum(values: (string | number)[]): TypeDescriptor {
    return { kind: 'enum', values };
  },

  generic(typeVar = 'T'): TypeDescriptor {
    return { kind: 'generic', typeVar };
  },

  passthrough(sourcePortId: string): TypeDescriptor {
    return { kind: 'passthrough', sourcePortId };
  },

  resolved(source: string, configField: string): TypeDescriptor {
    return { kind: 'resolved', source, configField };
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Type Guards
// ─────────────────────────────────────────────────────────────────────────────

/** Returns true if the type is concrete (not generic, passthrough, or resolved) */
export function isConcrete(desc: TypeDescriptor): boolean {
  return desc.kind !== 'generic' && desc.kind !== 'passthrough' && desc.kind !== 'resolved';
}

/** Returns true if the type accepts any value (any, unknown, or generic) */
export function isWildcard(desc: TypeDescriptor): boolean {
  return desc.kind === 'any' || desc.kind === 'unknown' || desc.kind === 'generic';
}

/** Returns true if the type needs resolution before it can be used */
export function needsResolution(desc: TypeDescriptor): boolean {
  return desc.kind === 'generic' || desc.kind === 'passthrough' || desc.kind === 'resolved';
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing — convert legacy typeName strings to TypeDescriptor
// ─────────────────────────────────────────────────────────────────────────────

const SIMPLE_TYPE_MAP: Record<string, TypeDescriptor> = {
  unknown: T.unknown,
  any: T.unknown,
  string: T.string,
  number: T.number,
  integer: T.number,
  boolean: T.boolean,
  null: T.null,
  array: T.array(T.unknown),
};

/** Parse a legacy typeName string (e.g. "string", "generic<T>", "passthrough(in)") into a TypeDescriptor */
export function parseTypeName(typeName?: string): TypeDescriptor {
  if (!typeName) {
    return T.generic();
  }

  const prefixed = parsePrefixedTypeName(typeName);
  if (prefixed) {
    return prefixed;
  }

  const simple = SIMPLE_TYPE_MAP[typeName];
  if (simple) {
    return simple;
  }

  if (typeName.endsWith('[]')) {
    return T.array(parseTypeName(typeName.slice(0, -2)));
  }

  return T.unknown;
}

function parsePrefixedTypeName(typeName: string): TypeDescriptor | null {
  if (typeName.startsWith('generic')) {
    return T.generic(/<(\w+)>/.exec(typeName)?.[1] ?? 'T');
  }
  if (typeName.startsWith('__passthrough:')) {
    return T.passthrough(typeName.slice('__passthrough:'.length));
  }
  if (typeName.startsWith('passthrough')) {
    return T.passthrough(/\((\w+)\)/.exec(typeName)?.[1] ?? 'in');
  }
  if (typeName.startsWith('$resolve:')) {
    const parts = typeName.slice('$resolve:'.length).split(':');
    return T.resolved(parts[0] ?? '', parts[1] ?? '');
  }
  return null;
}

/** Extract a TypeDescriptor from a port, preferring the structured `type` field over `typeName` */
export function parsePortType(port: {
  typeName?: string;
  type?: Record<string, unknown>;
}): TypeDescriptor {
  if (port.type && typeof port.type === 'object' && 'kind' in port.type) {
    return port.type as unknown as TypeDescriptor;
  }
  return parseTypeName(port.typeName);
}

/** Infer a TypeDescriptor from a runtime JSON value */
export function inferType(data: unknown): TypeDescriptor {
  if (data === null) {
    return T.null;
  }
  if (typeof data === 'string') {
    return T.string;
  }
  if (typeof data === 'number') {
    return T.number;
  }
  if (typeof data === 'boolean') {
    return T.boolean;
  }
  if (Array.isArray(data)) {
    return T.array(T.unknown);
  }
  if (typeof data === 'object') {
    return T.record(T.unknown);
  }
  return T.unknown;
}
