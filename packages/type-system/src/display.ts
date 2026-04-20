/**
 * Display — human-readable type names from TypeDescriptor.
 *
 * Produces TypeScript-like type strings:
 * - "string", "number", "boolean", "null"
 * - "{name: string, age: number}"
 * - "number[]"
 * - "string | number"
 * - "generic<T>"
 */

import type { TypeDescriptor } from './descriptor';

/**
 * Convert a TypeDescriptor to a human-readable type name string.
 */
export function displayType(desc: TypeDescriptor): string {
  switch (desc.kind) {
    case 'primitive':
      return desc.type;

    case 'literal':
      return typeof desc.value === 'string' ? `"${desc.value}"` : String(desc.value);

    case 'object': {
      const entries = Object.entries(desc.fields);
      if (entries.length === 0) {
        return '{}';
      }
      const fields = entries
        .map(([k, v]) => `${k}${v.optional ? '?' : ''}: ${displayType(v.type)}`)
        .join(', ');
      return `{${fields}}`;
    }

    case 'array': {
      const el = displayType(desc.element);
      // Wrap union types in parens for readability: (string | number)[]
      const needsParens = desc.element.kind === 'union';
      return needsParens ? `(${el})[]` : `${el}[]`;
    }

    case 'tuple': {
      const elements = desc.elements.map(displayType).join(', ');
      return `[${elements}]`;
    }

    case 'union':
      return desc.variants.map(displayType).join(' | ');

    case 'record': {
      return `Record<string, ${displayType(desc.value)}>`;
    }

    case 'enum':
      return desc.values.map((v) => (typeof v === 'string' ? `"${v}"` : String(v))).join(' | ');

    case 'any':
      return 'any';

    case 'unknown':
      return 'unknown';

    case 'generic':
      return `generic<${desc.typeVar}>`;

    case 'passthrough':
      return `passthrough(${desc.sourcePortId})`;

    case 'resolved':
      return `$resolve:${desc.source}:${desc.configField}`;
  }
}
