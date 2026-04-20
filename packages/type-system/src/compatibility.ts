/**
 * Structural Type Compatibility
 *
 * Checks if an output type can flow into an input type.
 * Replaces both arePortTypesCompatible (string-based) and isSchemaCompatible (Zod-based).
 *
 * Rules (in priority order):
 * 1. any/unknown/generic inputs accept everything
 * 2. any/unknown/generic outputs are accepted by everything
 * 3. Exact kind + structural match
 * 4. Numeric equivalence (number/integer/float/double all compatible)
 * 5. Widening: number/boolean → string
 * 6. Object structural subtyping
 * 7. Union rules (output union: all must satisfy; input union: one must match)
 */

import type { TypeDescriptor } from './descriptor';

const NUMERIC_TYPES = new Set(['number', 'integer', 'float', 'double']);

/**
 * Check if an output type is compatible with an input type.
 * Returns true if data of `output` type can safely flow into a port expecting `input` type.
 */
export function isCompatible(output: TypeDescriptor, input: TypeDescriptor): boolean {
  // Wildcards accept/produce anything
  if (isAcceptAll(input) || isAcceptAll(output)) {
    return true;
  }

  // Passthrough/resolved are treated as wildcards (they need resolution first)
  if (input.kind === 'passthrough' || input.kind === 'resolved') {
    return true;
  }
  if (output.kind === 'passthrough' || output.kind === 'resolved') {
    return true;
  }

  // Exact same kind — dispatch to specific checker
  if (output.kind === input.kind) {
    return checkSameKind(output, input);
  }

  // Union handling
  if (input.kind === 'union') {
    return input.variants.some((variant) => isCompatible(output, variant));
  }
  if (output.kind === 'union') {
    return output.variants.every((variant) => isCompatible(variant, input));
  }

  return checkCrossKind(output, input);
}

function checkCrossKind(output: TypeDescriptor, input: TypeDescriptor): boolean {
  // Enum → primitive widening
  if (output.kind === 'enum' && input.kind === 'primitive') {
    return isEnumCompatibleWithPrimitive(output.values, input.type);
  }

  // Literal → primitive widening
  if (output.kind === 'literal' && input.kind === 'primitive') {
    return isLiteralCompatibleWithPrimitive(output.value, input.type);
  }

  // Primitive widening: number/boolean → string
  if (output.kind === 'primitive' && input.kind === 'primitive') {
    return isPrimitiveCompatible(output.type, input.type);
  }

  // Record → object: a record can satisfy an object if value type is compatible with all fields
  if (output.kind === 'record' && input.kind === 'object') {
    return Object.values(input.fields).every(
      (field) => field.optional || isCompatible(output.value, field.type)
    );
  }

  // Object → record: an object can produce a record
  if (output.kind === 'object' && input.kind === 'record') {
    return Object.values(output.fields).every((field) => isCompatible(field.type, input.value));
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function isAcceptAll(desc: TypeDescriptor): boolean {
  return desc.kind === 'any' || desc.kind === 'unknown' || desc.kind === 'generic';
}

function checkSameKind(output: TypeDescriptor, input: TypeDescriptor): boolean {
  switch (output.kind) {
    case 'primitive':
      return isPrimitiveCompatible(
        output.type,
        (input as Extract<TypeDescriptor, { kind: 'primitive' }>).type
      );

    case 'literal': {
      const inputLit = input as Extract<TypeDescriptor, { kind: 'literal' }>;
      return output.value === inputLit.value;
    }

    case 'object': {
      const inputObj = input as Extract<TypeDescriptor, { kind: 'object' }>;
      return isObjectCompatible(output.fields, inputObj.fields);
    }

    case 'array': {
      const inputArr = input as Extract<TypeDescriptor, { kind: 'array' }>;
      return isCompatible(output.element, inputArr.element);
    }

    case 'tuple': {
      const inputTuple = input as Extract<TypeDescriptor, { kind: 'tuple' }>;
      if (output.elements.length !== inputTuple.elements.length) {
        return false;
      }
      return output.elements.every((el, i) => {
        const inputEl = inputTuple.elements[i];
        return inputEl !== undefined && isCompatible(el, inputEl);
      });
    }

    case 'union': {
      const inputUnion = input as Extract<TypeDescriptor, { kind: 'union' }>;
      // All output variants must satisfy at least one input variant
      return output.variants.every((outV) =>
        inputUnion.variants.some((inV) => isCompatible(outV, inV))
      );
    }

    case 'record': {
      const inputRec = input as Extract<TypeDescriptor, { kind: 'record' }>;
      return isCompatible(output.value, inputRec.value);
    }

    case 'enum': {
      const inputEnum = input as Extract<TypeDescriptor, { kind: 'enum' }>;
      // All output values must be in input values
      return output.values.every((v) => inputEnum.values.includes(v));
    }

    default:
      return true;
  }
}

function isPrimitiveCompatible(outputType: string, inputType: string): boolean {
  if (outputType === inputType) {
    return true;
  }

  // Numeric equivalence
  if (NUMERIC_TYPES.has(outputType) && NUMERIC_TYPES.has(inputType)) {
    return true;
  }

  // Widening: number/boolean → string
  if (inputType === 'string' && (NUMERIC_TYPES.has(outputType) || outputType === 'boolean')) {
    return true;
  }

  return false;
}

function isObjectCompatible(
  outputFields: Record<string, { type: TypeDescriptor; optional: boolean }>,
  inputFields: Record<string, { type: TypeDescriptor; optional: boolean }>
): boolean {
  // All required input fields must exist in output with compatible types
  for (const [key, inputField] of Object.entries(inputFields)) {
    const outputField = outputFields[key];

    if (!outputField) {
      // Output doesn't have this field
      if (!inputField.optional) {
        return false;
      }
      continue;
    }

    // Check field type compatibility
    if (!isCompatible(outputField.type, inputField.type)) {
      return false;
    }
  }

  return true;
}

function isEnumCompatibleWithPrimitive(
  values: readonly (string | number)[],
  primitiveType: string
): boolean {
  if (primitiveType === 'string') {
    return values.every((v) => typeof v === 'string' || typeof v === 'number');
  }
  if (NUMERIC_TYPES.has(primitiveType)) {
    return values.every((v) => typeof v === 'number');
  }
  return false;
}

function isLiteralCompatibleWithPrimitive(
  value: string | number | boolean,
  primitiveType: string
): boolean {
  if (primitiveType === 'string') {
    return true; // any literal can be stringified
  }
  if (primitiveType === 'boolean') {
    return typeof value === 'boolean';
  }
  if (NUMERIC_TYPES.has(primitiveType)) {
    return typeof value === 'number';
  }
  return false;
}
