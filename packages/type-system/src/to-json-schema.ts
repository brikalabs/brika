/**
 * TypeDescriptor → JSON Schema conversion.
 *
 * Produces standard JSON Schema (draft 2020-12 compatible) for API consumers
 * that need JSON Schema format (e.g., UI schema rendering, documentation).
 */

import type { TypeDescriptor } from './descriptor';

/**
 * Convert a TypeDescriptor to a JSON Schema object.
 */
export function toJsonSchema(desc: TypeDescriptor): Record<string, unknown> {
  switch (desc.kind) {
    case 'primitive':
      return { type: desc.type === 'null' ? 'null' : desc.type };

    case 'literal':
      return { const: desc.value };

    case 'object': {
      const properties: Record<string, Record<string, unknown>> = {};
      const required: string[] = [];

      for (const [key, field] of Object.entries(desc.fields)) {
        properties[key] = toJsonSchema(field.type);
        if (!field.optional) {
          required.push(key);
        }
      }

      const schema: Record<string, unknown> = { type: 'object', properties };
      if (required.length > 0) {
        schema.required = required;
      }
      return schema;
    }

    case 'array':
      return { type: 'array', items: toJsonSchema(desc.element) };

    case 'tuple':
      return { type: 'array', prefixItems: desc.elements.map(toJsonSchema) };

    case 'union':
      return { anyOf: desc.variants.map(toJsonSchema) };

    case 'record':
      return { type: 'object', additionalProperties: toJsonSchema(desc.value) };

    case 'enum':
      return { enum: [...desc.values] };

    case 'any':
      return {};

    case 'unknown':
      return {};

    case 'generic':
      return { description: `generic<${desc.typeVar}>` };

    case 'passthrough':
      return { description: `passthrough(${desc.sourcePortId})` };

    case 'resolved':
      return { description: `$resolve:${desc.source}:${desc.configField}` };
  }
}
