/**
 * @brika/type-system — unified type system for workflow port types.
 *
 * Single source of truth for port types across backend and frontend.
 * Provides:
 * - TypeDescriptor: serializable, structural type representation
 * - isCompatible: structural type compatibility checking
 * - inferTypes: graph-based type inference for generic/passthrough/resolved ports
 * - getCompletions: autocomplete items from resolved types
 * - displayType: human-readable type name strings
 * - zodToDescriptor: Zod schema → TypeDescriptor conversion
 * - fromJsonSchema: JSON Schema → TypeDescriptor conversion
 * - toJsonSchema: TypeDescriptor → JSON Schema conversion
 */

export type { PrimitiveType, TypeDescriptor } from './descriptor';
export { T, isConcrete, isWildcard, needsResolution, parseTypeName, parsePortType, inferType } from './descriptor';

export { displayType } from './display';

export { isCompatible } from './compatibility';

export type { CompletionItem } from './autocomplete';
export { getCompletions } from './autocomplete';

export type { GraphEdge, GraphNode, PortTypeMap, TypeResolver } from './inference';
export { inferTypes, portKey } from './inference';

export { fromJsonSchema, zodToDescriptor } from './from-zod';

export { toJsonSchema } from './to-json-schema';
