/**
 * Plugin manifest and capability type definitions.
 *
 * These types mirror the Zod schemas in @brika/schema and describe
 * the structure of plugin capabilities in package.json.
 */

import type { PreferenceDefinition } from './preferences';

// ─────────────────────────────────────────────────────────────────────────────
// Capability Manifests (from package.json)
// ─────────────────────────────────────────────────────────────────────────────

/** Block manifest from package.json */
export interface BlockManifest {
  id: string;
  name?: string;
  description?: string;
  category?: 'trigger' | 'flow' | 'action' | 'transform';
  icon?: string;
  color?: string;
}

/** Spark (typed event) manifest from package.json */
export interface SparkManifest {
  id: string;
  name?: string;
  description?: string;
}

/** Brick size family */
export type BrickFamily = 'sm' | 'md' | 'lg';

/** Brick (board UI) manifest from package.json */
export interface BrickManifest {
  id: string;
  name?: string;
  description?: string;
  category?: string;
  icon?: string;
  color?: string;
  families?: BrickFamily[];
  config?: PreferenceDefinition[];
}

/** Plugin page manifest from package.json */
export interface PageManifest {
  id: string;
  icon?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin Manifest (from package.json)
// ─────────────────────────────────────────────────────────────────────────────

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?:
    | string
    | {
        name: string;
        email?: string;
        url?: string;
      };
  homepage?: string;
  repository?:
    | string
    | {
        type?: string;
        url: string;
        directory?: string;
      };
  icon?: string;
  keywords?: string[];
  license?: string;
  engines?: {
    brika?: string;
  };
  main?: string;
  blocks?: BlockManifest[];
  sparks?: SparkManifest[];
  bricks?: BrickManifest[];
  pages?: PageManifest[];
  preferences?: PreferenceDefinition[];
}
