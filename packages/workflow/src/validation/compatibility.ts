/**
 * Schema Compatibility
 *
 * Check if Zod schemas are compatible for port connections.
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Schema Compatibility
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if an output schema is compatible with an input schema.
 *
 * Compatibility rules:
 * - z.unknown() or z.any() input accepts ANY output
 * - Same type is always compatible
 * - Object outputs can satisfy partial object inputs (structural typing)
 * - Union outputs require all variants to satisfy input
 *
 * @param outputSchema - Schema of the source port's output
 * @param inputSchema - Schema of the target port's input
 * @returns true if output can flow into input
 */
export function isSchemaCompatible(outputSchema: z.ZodType, inputSchema: z.ZodType): boolean {
  // Input accepts anything
  if (isAnyType(inputSchema)) {
    return true;
  }

  // Get the underlying types
  const outputType = getBaseType(outputSchema);
  const inputType = getBaseType(inputSchema);

  // Same type check
  if (outputType === inputType) {
    return true;
  }

  // Try to validate a sample value from output against input
  // This is a heuristic - for complex types we'd need more sophisticated checking
  return checkStructuralCompatibility(outputSchema, inputSchema);
}

/**
 * Check if a schema accepts any type.
 */
function isAnyType(schema: z.ZodType): boolean {
  const def = (schema as z.ZodType & { _def?: { typeName?: string } })._def;
  if (!def) return false;

  const typeName = def.typeName;
  return typeName === 'ZodAny' || typeName === 'ZodUnknown';
}

/**
 * Get the base type name from a schema.
 */
function getBaseType(schema: z.ZodType): string {
  const def = (schema as z.ZodType & { _def?: { typeName?: string } })._def;
  return def?.typeName ?? 'unknown';
}

/**
 * Check structural compatibility between schemas.
 * Uses a heuristic approach - checks if typical output values would pass input validation.
 */
function checkStructuralCompatibility(outputSchema: z.ZodType, inputSchema: z.ZodType): boolean {
  const outputDef = (outputSchema as z.ZodType & { _def?: { typeName?: string } })._def;
  const inputDef = (inputSchema as z.ZodType & { _def?: { typeName?: string } })._def;

  if (!outputDef || !inputDef) return false;

  const outputType = outputDef.typeName;
  const inputType = inputDef.typeName;

  // Handle optional/nullable wrappers
  if (inputType === 'ZodOptional' || inputType === 'ZodNullable') {
    const innerDef = inputDef as { innerType?: z.ZodType };
    if (innerDef.innerType) {
      return isSchemaCompatible(outputSchema, innerDef.innerType);
    }
  }

  // Handle union inputs - output must satisfy at least one variant
  if (inputType === 'ZodUnion') {
    const unionDef = inputDef as { options?: z.ZodType[] };
    if (unionDef.options) {
      return unionDef.options.some((opt) => isSchemaCompatible(outputSchema, opt));
    }
  }

  // Handle union outputs - all variants must satisfy input
  if (outputType === 'ZodUnion') {
    const unionDef = outputDef as { options?: z.ZodType[] };
    if (unionDef.options) {
      return unionDef.options.every((opt) => isSchemaCompatible(opt, inputSchema));
    }
  }

  // Primitive type matching
  const primitiveTypes = ['ZodString', 'ZodNumber', 'ZodBoolean', 'ZodNull'];
  if (
    outputType &&
    inputType &&
    primitiveTypes.includes(outputType) &&
    primitiveTypes.includes(inputType)
  ) {
    return outputType === inputType;
  }

  // Array compatibility
  if (outputType === 'ZodArray' && inputType === 'ZodArray') {
    const outputElement = (outputDef as { element?: z.ZodType }).element;
    const inputElement = (inputDef as { element?: z.ZodType }).element;
    if (outputElement && inputElement) {
      return isSchemaCompatible(outputElement, inputElement);
    }
  }

  // Object compatibility - check if output has all required input fields
  if (outputType === 'ZodObject' && inputType === 'ZodObject') {
    return checkObjectCompatibility(
      outputSchema as z.ZodObject<z.ZodRawShape>,
      inputSchema as z.ZodObject<z.ZodRawShape>
    );
  }

  // Default: not compatible
  return false;
}

/**
 * Check if an output object satisfies an input object schema.
 */
function checkObjectCompatibility(
  outputSchema: z.ZodObject<z.ZodRawShape>,
  inputSchema: z.ZodObject<z.ZodRawShape>
): boolean {
  const outputShape = outputSchema.shape;
  const inputShape = inputSchema.shape;

  // All required input fields must exist in output with compatible types
  for (const [key, inputField] of Object.entries(inputShape)) {
    const outputField = outputShape[key];

    // Check if input field is optional
    const isOptional =
      (inputField as z.ZodType & { _def?: { typeName?: string } })._def?.typeName === 'ZodOptional';

    if (!outputField) {
      // Output missing this field
      if (!isOptional) {
        return false; // Required field missing
      }
      continue; // Optional field can be missing
    }

    // Check field type compatibility
    if (!isSchemaCompatible(outputField as z.ZodType, inputField as z.ZodType)) {
      return false;
    }
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate data against a port schema.
 *
 * @param data - Data to validate
 * @param schema - Zod schema to validate against
 * @returns Validation result
 */
export function validatePortData(
  data: unknown,
  schema: z.ZodType
): { valid: true; data: unknown } | { valid: false; error: string } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { valid: true, data: result.data };
  }

  const errors = result.error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');

  return { valid: false, error: errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Type Name Extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a human-readable type name from a Zod schema.
 */
export function getSchemaTypeName(schema: z.ZodType): string {
  const def = (schema as z.ZodType & { _def?: { typeName?: string } })._def;
  if (!def) return 'unknown';

  const typeName = def.typeName;

  switch (typeName) {
    case 'ZodString':
      return 'string';
    case 'ZodNumber':
      return 'number';
    case 'ZodBoolean':
      return 'boolean';
    case 'ZodNull':
      return 'null';
    case 'ZodUndefined':
      return 'undefined';
    case 'ZodAny':
    case 'ZodUnknown':
      return 'any';
    case 'ZodArray': {
      const element = (def as { element?: z.ZodType }).element;
      return element ? `${getSchemaTypeName(element)}[]` : 'array';
    }
    case 'ZodObject':
      return 'object';
    case 'ZodUnion':
      return 'union';
    case 'ZodOptional': {
      const inner = (def as { innerType?: z.ZodType }).innerType;
      return inner ? `${getSchemaTypeName(inner)}?` : 'optional';
    }
    case 'ZodNullable': {
      const inner = (def as { innerType?: z.ZodType }).innerType;
      return inner ? `${getSchemaTypeName(inner)} | null` : 'nullable';
    }
    case 'ZodDate':
      return 'Date';
    case 'ZodRecord':
      return 'Record';
    case 'ZodMap':
      return 'Map';
    case 'ZodSet':
      return 'Set';
    default:
      return typeName?.replace('Zod', '').toLowerCase() ?? 'unknown';
  }
}
