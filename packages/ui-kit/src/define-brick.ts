/**
 * defineBrick — Brick Type Registration
 *
 * Plugins register brick **types** via `defineBrick()`. Each type can be placed
 * multiple times on boards as independent **instances**, each with its own
 * size (w/h grid units), config values, and isolated hooks state.
 */

import type { PreferenceDefinition } from '@brika/shared';
import type { ComponentNode } from './nodes';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Supported brick size families (convention sizes for catalog display) */
export type BrickFamily = 'sm' | 'md' | 'lg';

/** Brick type spec — static metadata for type registration */
export interface BrickTypeSpec {
  id: string;
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
  category?: string;
  /** Convention sizes for catalog display */
  families: BrickFamily[];
  /** Minimum grid size (default: { w: 1, h: 1 }) */
  minSize?: { w: number; h: number };
  /** Maximum grid size (default: { w: 12, h: 8 }) */
  maxSize?: { w: number; h: number };
  config?: PreferenceDefinition[];
}

/** Runtime context provided to each brick instance on every render */
export interface BrickInstanceContext {
  instanceId: string;
  config: Record<string, unknown>;
}

/** Action handler receives optional payload from the UI */
export type { ActionHandler as BrickActionHandler } from './nodes';

/**
 * Brick component function — called on every render.
 * Receives instance context (config, instanceId).
 * Use hooks (useState, useEffect, useBrickSize, etc.) inside.
 * Pass handler functions directly to component props (onToggle, onPress, onChange).
 * Returns JSX / ComponentNode(s) describing the brick body.
 */
export type BrickComponent = (ctx: BrickInstanceContext) => ComponentNode | ComponentNode[];

/** Compiled brick type — ready for SDK registration */
export interface CompiledBrickType {
  spec: BrickTypeSpec;
  component: BrickComponent;
}

// ─────────────────────────────────────────────────────────────────────────────
// defineBrick
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Define a board brick type with hooks.
 *
 * @example
 * ```tsx
 * export const thermostat = defineBrick({
 *   id: 'thermostat',
 *   name: 'Thermostat',
 *   icon: 'thermometer',
 *   families: ['sm', 'md', 'lg'],
 *   minSize: { w: 1, h: 1 },
 *   maxSize: { w: 6, h: 6 },
 * }, ({ config }) => {
 *   const { width, height } = useBrickSize();
 *   if (width <= 2 && height <= 2) {
 *     return <Stat label="Temp" value="21.5°C" />;
 *   }
 *   return (
 *     <>
 *       <Stat label={config.room as string} value={21.5} unit="°C" />
 *       <Toggle label="Heating" checked={heating} onToggle="toggle-heat" />
 *     </>
 *   );
 * });
 * ```
 */
export function defineBrick(spec: BrickTypeSpec, component: BrickComponent): CompiledBrickType {
  return { spec, component };
}
