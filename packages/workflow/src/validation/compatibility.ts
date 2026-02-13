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

  // Output could produce anything - allow connection (flexible typing)
  if (isAnyType(outputSchema)) {
    return true;
  }

  // Get the underlying types
  const outputType = getBaseType(outputSchema);
  const inputType = getBaseType(inputSchema);

  // For structured types (objects, arrays), we need deeper checking
  const structuredTypes = new Set(['object', 'array']);
  if (structuredTypes.has(outputType) || structuredTypes.has(inputType)) {
    return checkStructuralCompatibility(outputSchema, inputSchema);
  }

  // Same type check for primitives
  if (outputType === inputType) {
    return true;
  }

  // Try to validate structural compatibility for other types
  return checkStructuralCompatibility(outputSchema, inputSchema);
}

/**
 * Get the Zod type name from a schema using constructor name.
 * Returns lowercase type names like 'string', 'object', 'array', etc.
 */
function getZodTypeName(schema: z.ZodType): string {
  // Use constructor name (most reliable across Zod versions)
  const constructorName = schema.constructor?.name;
  if (constructorName?.startsWith('Zod')) {
    return constructorName.slice(3).toLowerCase();
  }
  // Fallback to _def.type (Zod v3.23+)
  const def = schema as z.ZodType & { _def?: { type?: string } };
  return def._def?.type ?? 'unknown';
}

/**
 * Check if a schema accepts any type.
 */
function isAnyType(schema: z.ZodType): boolean {
  const typeName = getZodTypeName(schema);
  return typeName === 'any' || typeName === 'unknown';
}

/**
 * Get the base type name from a schema.
 */
function getBaseType(schema: z.ZodType): string {
  return getZodTypeName(schema);
}

/**
 * Check structural compatibility between schemas.
 * Uses a heuristic approach - checks if typical output values would pass input validation.
 */
function checkStructuralCompatibility(outputSchema: z.ZodType, inputSchema: z.ZodType): boolean {
  const outputType = getZodTypeName(outputSchema);
  const inputType = getZodTypeName(inputSchema);

  // Get _def for inner type access
  const outputDef = (outputSchema as z.ZodType & { _def?: unknown })._def;
  const inputDef = (inputSchema as z.ZodType & { _def?: unknown })._def;

  // Try each compatibility check in order
  const wrapperResult = checkWrapperTypeCompatibility(
    outputSchema,
    inputSchema,
    inputType,
    inputDef
  );
  if (wrapperResult !== null) return wrapperResult;

  const unionResult = checkUnionTypeCompatibility(
    outputSchema,
    inputSchema,
    outputType,
    outputDef,
    inputType,
    inputDef
  );
  if (unionResult !== null) return unionResult;

  const primitiveResult = checkPrimitiveTypeCompatibility(outputType, inputType);
  if (primitiveResult !== null) return primitiveResult;

  const collectionResult = checkCollectionTypeCompatibility(
    outputSchema,
    inputSchema,
    outputType,
    outputDef,
    inputType,
    inputDef
  );
  if (collectionResult !== null) return collectionResult;

  return false;
}

/**
 * Check if input type is a wrapper (optional/nullable) and handle unwrapping
 */
function checkWrapperTypeCompatibility(
  outputSchema: z.ZodType,
  inputSchema: z.ZodType,
  inputType: string,
  inputDef: unknown
): boolean | null {
  if (inputType === 'optional' || inputType === 'nullable') {
    const innerDef = inputDef as { innerType?: z.ZodType };
    if (innerDef.innerType) {
      return isSchemaCompatible(outputSchema, innerDef.innerType);
    }
  }
  return null;
}

/**
 * Check union type compatibility
 */
function checkUnionTypeCompatibility(
  outputSchema: z.ZodType,
  inputSchema: z.ZodType,
  outputType: string,
  outputDef: unknown,
  inputType: string,
  inputDef: unknown
): boolean | null {
  // Handle union inputs - output must satisfy at least one variant
  if (inputType === 'union') {
    const unionDef = inputDef as { options?: z.ZodType[] };
    if (unionDef.options) {
      return unionDef.options.some((opt) => isSchemaCompatible(outputSchema, opt));
    }
  }

  // Handle union outputs - all variants must satisfy input
  if (outputType === 'union') {
    const unionDef = outputDef as { options?: z.ZodType[] };
    if (unionDef.options) {
      return unionDef.options.every((opt) => isSchemaCompatible(opt, inputSchema));
    }
  }

  return null;
}

/**
 * Check primitive type compatibility
 */
function checkPrimitiveTypeCompatibility(outputType: string, inputType: string): boolean | null {
  const primitiveTypes = new Set(['string', 'number', 'boolean', 'null']);
  if (primitiveTypes.has(outputType) && primitiveTypes.has(inputType)) {
    return outputType === inputType;
  }
  return null;
}

/**
 * Check collection type compatibility (arrays and objects)
 */
function checkCollectionTypeCompatibility(
  outputSchema: z.ZodType,
  inputSchema: z.ZodType,
  outputType: string,
  outputDef: unknown,
  inputType: string,
  inputDef: unknown
): boolean | null {
  // Array compatibility
  if (outputType === 'array' && inputType === 'array') {
    const outputElement = (outputDef as { element?: z.ZodType }).element;
    const inputElement = (inputDef as { element?: z.ZodType }).element;
    if (outputElement && inputElement) {
      return isSchemaCompatible(outputElement, inputElement);
    }
  }

  // Object compatibility
  if (outputType === 'object' && inputType === 'object') {
    return checkObjectCompatibility(
      outputSchema as z.ZodObject<z.ZodRawShape>,
      inputSchema as z.ZodObject<z.ZodRawShape>
    );
  }

  return null;
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
    const isOptional = getZodTypeName(inputField as z.ZodType) === 'optional';

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
  const typeName = getZodTypeName(schema);
  const def = (schema as z.ZodType & { _def?: unknown })._def;

  switch (typeName) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'undefined':
      return 'undefined';
    case 'any':
      return 'any';
    case 'unknown':
      return 'unknown';
    case 'array': {
      const element = (def as { element?: z.ZodType })?.element;
      return element ? `${getSchemaTypeName(element)}[]` : 'array';
    }
    case 'object':
      return 'object';
    case 'union':
      return 'union';
    case 'optional': {
      const inner = (def as { innerType?: z.ZodType })?.innerType;
      return inner ? `${getSchemaTypeName(inner)}?` : 'optional';
    }
    case 'nullable': {
      const inner = (def as { innerType?: z.ZodType })?.innerType;
      return inner ? `${getSchemaTypeName(inner)} | null` : 'nullable';
    }
    case 'date':
      return 'Date';
    case 'record':
      return 'Record';
    case 'map':
      return 'Map';
    case 'set':
      return 'Set';
    default:
      return typeName;
  }
}
