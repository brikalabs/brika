/**
 * @brika/sdk/bricks/core
 *
 * Core brick API: defineBrick, hooks, and types.
 * Import UI components separately from '@brika/sdk/bricks/components'.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type {
  ActionNode,
  BrickActionHandler,
  BrickComponent,
  BrickDescriptor,
  BrickFamily,
  BrickInstanceContext,
  BrickTypeSpec,
  ComponentNode,
  CompiledBrickType,
} from '@brika/ui-kit';

// ─────────────────────────────────────────────────────────────────────────────
// defineBrick (auto-registering wrapper)
// ─────────────────────────────────────────────────────────────────────────────

export { defineBrick } from '../api/bricks';

// ─────────────────────────────────────────────────────────────────────────────
// Hooks (React-like hooks for brick components)
// ─────────────────────────────────────────────────────────────────────────────

export { useAction, useCallback, useBrickSize, useEffect, useMemo, usePluginPreference, usePreference, useRef, useState } from '../brick-hooks';
