/**
 * Component metadata shape — co-located with the components themselves.
 *
 * Each component folder ships a `meta.ts` exporting `meta: ComponentMeta`.
 * Discovery happens in user code (the docs site uses `import.meta.glob`
 * to assemble the runtime list), so adding a new component is zero
 * edits in this package — drop a folder with `meta.ts` and you're done.
 *
 * This file is the package-level shape contract. It exports types only;
 * no runtime list lives here, which is what keeps Clay free of
 * generated files and bundler-specific build hooks.
 */

export type ComponentGroup =
  | 'Primitives'
  | 'Forms'
  | 'Overlays'
  | 'Navigation'
  | 'Feedback'
  | 'Layout'
  | 'Data';

export interface ComponentMeta {
  /** Folder name. Matches the kebab-case CSS prefix used by tokens (`appliesTo`). */
  readonly name: string;
  /** Human-friendly name used as the docs page title and sidebar label. */
  readonly displayName: string;
  /** Coarse grouping used by the docs sidebar. */
  readonly group: ComponentGroup;
  /** One-paragraph blurb shown at the top of the component's docs page. */
  readonly description: string;
}
