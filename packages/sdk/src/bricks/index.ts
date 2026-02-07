/**
 * @brika/sdk/bricks
 *
 * Dashboard brick API: defineBrick, hooks, and UI components.
 *
 * For finer-grained imports:
 *   - '@brika/sdk/bricks/core'       — defineBrick + hooks
 *   - '@brika/sdk/bricks/components'  — Stat, Toggle, Section, ...
 *
 * @example
 * ```tsx
 * import { defineBrick, useState, useEffect, useAction, Stat, Toggle, Section } from '@brika/sdk/bricks';
 *
 * export const myBrick = defineBrick({
 *   id: 'my-brick',
 *   name: 'My Brick',
 *   families: ['sm', 'md'],
 * }, ({ config }) => {
 *   const [on, setOn] = useState(false);
 *   useAction('toggle', (p) => setOn(p?.checked as boolean));
 *   return <Toggle label="Power" checked={on} onToggle="toggle" />;
 * });
 * ```
 */

export * from './core';
export * from './components';
