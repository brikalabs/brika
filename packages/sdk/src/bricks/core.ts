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
  CompiledBrickType,
  ComponentNode,
  I18nRef,
  IntlRef,
  TextContent,
} from '@brika/ui-kit';

// ─────────────────────────────────────────────────────────────────────────────
// defineBrick (auto-registering wrapper)
// ─────────────────────────────────────────────────────────────────────────────

export { defineBrick } from '../api/bricks';

// ─────────────────────────────────────────────────────────────────────────────
// Hooks (React-like hooks for brick components)
// ─────────────────────────────────────────────────────────────────────────────

export {
  useBrickSize,
  useCallback,
  useEffect,
  useIntl,
  useLocale,
  useMemo,
  usePluginPreference,
  usePreference,
  useRef,
  useState,
  useTranslation,
} from '../brick-hooks';

// ─────────────────────────────────────────────────────────────────────────────
// Shared Store (Zustand-style reactive store across brick instances)
// ─────────────────────────────────────────────────────────────────────────────

export { defineSharedStore, type SharedStore } from '../brick-hooks';
