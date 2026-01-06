/**
 * Validation
 *
 * Port compatibility and connection validation.
 */

export {
  getSchemaTypeName,
  isSchemaCompatible,
  validatePortData,
} from './compatibility';
export {
  type ConnectionCheck,
  type ConnectionResult,
  isValidConnection,
} from './connections';

export {
  type ValidationError,
  type ValidationResult,
  validateWorkspace,
} from './workspace';
