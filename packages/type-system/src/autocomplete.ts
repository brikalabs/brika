/**
 * Autocomplete — generate completion items from TypeDescriptor.
 *
 * Given a resolved type, produces a flat list of completable paths
 * with their types. Used by the expression editor to offer
 * deep property autocompletion (e.g., inputs.in.name, inputs.in.age).
 */

import type { TypeDescriptor } from './descriptor';
import { displayType } from './display';

// ─────────────────────────────────────────────────────────────────────────────
// Completion Item
// ─────────────────────────────────────────────────────────────────────────────

export interface CompletionItem {
  /** Short label (e.g., "name") */
  label: string;
  /** Type display string (e.g., "string") */
  type: string;
  /** Full dotted path (e.g., "inputs.in.name") */
  path: string;
  /** Whether this item has children (for nested objects) */
  hasChildren: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Entry Point
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_MAX_DEPTH = 3;

/**
 * Get autocomplete items for a type at a given base path.
 *
 * @param desc - The TypeDescriptor to explore
 * @param basePath - The path prefix (e.g., "inputs.in")
 * @param maxDepth - Maximum depth to recurse (default 3)
 * @returns Flat list of completion items
 */
export function getCompletions(
  desc: TypeDescriptor,
  basePath: string,
  maxDepth = DEFAULT_MAX_DEPTH
): CompletionItem[] {
  const items: CompletionItem[] = [];

  // Add the root item itself
  items.push({
    label: lastSegment(basePath),
    type: displayType(desc),
    path: basePath,
    hasChildren: hasNestedFields(desc),
  });

  // Recurse into fields
  if (maxDepth > 0) {
    collectFields(desc, basePath, maxDepth, items);
  }

  return items;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal
// ─────────────────────────────────────────────────────────────────────────────

function collectFields(
  desc: TypeDescriptor,
  basePath: string,
  depth: number,
  items: CompletionItem[]
): void {
  if (depth <= 0) {
    return;
  }

  switch (desc.kind) {
    case 'object': {
      for (const [fieldName, field] of Object.entries(desc.fields)) {
        const path = `${basePath}.${fieldName}`;
        items.push({
          label: fieldName,
          type: displayType(field.type),
          path,
          hasChildren: hasNestedFields(field.type),
        });
        collectFields(field.type, path, depth - 1, items);
      }
      break;
    }

    case 'array': {
      // Offer [n] access for element type
      const path = `${basePath}[n]`;
      items.push({
        label: '[n]',
        type: displayType(desc.element),
        path,
        hasChildren: hasNestedFields(desc.element),
      });
      collectFields(desc.element, path, depth - 1, items);
      break;
    }

    case 'record': {
      // Offer [key] access for value type
      const path = `${basePath}[key]`;
      items.push({
        label: '[key]',
        type: displayType(desc.value),
        path,
        hasChildren: hasNestedFields(desc.value),
      });
      collectFields(desc.value, path, depth - 1, items);
      break;
    }

    case 'union': {
      // For unions, expose fields that are common across all object variants
      const commonFields = getCommonObjectFields(desc.variants);
      if (commonFields) {
        for (const [fieldName, fieldType] of Object.entries(commonFields)) {
          const path = `${basePath}.${fieldName}`;
          items.push({
            label: fieldName,
            type: displayType(fieldType),
            path,
            hasChildren: hasNestedFields(fieldType),
          });
          collectFields(fieldType, path, depth - 1, items);
        }
      }
      break;
    }
    // Primitives, literals, enums, etc. have no nested fields
  }
}

function hasNestedFields(desc: TypeDescriptor): boolean {
  return desc.kind === 'object' || desc.kind === 'array' || desc.kind === 'record';
}

function lastSegment(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot >= 0 ? path.slice(dot + 1) : path;
}

/**
 * For a union of object types, find fields that exist in ALL variants.
 * Returns a map of fieldName → TypeDescriptor (using the first variant's type).
 */
function getCommonObjectFields(
  variants: readonly TypeDescriptor[]
): Record<string, TypeDescriptor> | null {
  const objectVariants = variants.filter(
    (v): v is Extract<TypeDescriptor, { kind: 'object' }> => v.kind === 'object'
  );

  if (objectVariants.length === 0 || objectVariants.length !== variants.length) {
    return null;
  }

  // Start with fields from the first variant, keep only those present in all
  const first = objectVariants[0] as Extract<TypeDescriptor, { kind: 'object' }>;
  const common: Record<string, TypeDescriptor> = {};

  for (const [fieldName, field] of Object.entries(first.fields)) {
    const presentInAll = objectVariants.every((v) => fieldName in v.fields);
    if (presentInAll) {
      common[fieldName] = field.type;
    }
  }

  return Object.keys(common).length > 0 ? common : null;
}
