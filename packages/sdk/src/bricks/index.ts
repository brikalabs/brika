/**
 * @brika/sdk/bricks
 *
 * Board brick API: defineBrick, hooks, and UI components.
 *
 * For finer-grained imports:
 *   - '@brika/sdk/bricks/core'       — defineBrick + hooks
 *   - '@brika/sdk/bricks/components'  — Stat, Toggle, Section, ...
 *
 * @example
 * ```tsx
 * import { defineBrick, useState, Stat, Toggle } from '@brika/sdk/bricks';
 *
 * export const myBrick = defineBrick({
 *   id: 'my-brick',
 *   name: 'My Brick',
 *   families: ['sm', 'md'],
 * }, ({ config }) => {
 *   const [on, setOn] = useState(false);
 *   return <Toggle label="Power" checked={on} onToggle={(p) => setOn(p?.checked as boolean)} />;
 * });
 * ```
 */

export * from './components';
export * from './core';
