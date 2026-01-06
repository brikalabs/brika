/**
 * Serialization
 *
 * Re-exports from @brika/serializable plus workflow-specific ToolRef.
 */

// Re-export everything from @brika/serializable
export * from '@brika/serializable';

// ToolRef is workflow/SDK specific
export * from './tool-ref';

// Register ToolRef transformer on import
import { registerTransformer } from '@brika/serializable';
import { ToolRefTransformer } from './tool-ref';

registerTransformer(ToolRefTransformer);
