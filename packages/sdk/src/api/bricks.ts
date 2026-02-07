/**
 * Brick API
 *
 * Register brick types with the hub. Rendering happens per-instance
 * when the hub sends mountBrickInstance.
 */

import type { BrickComponent, BrickTypeSpec, CompiledBrickType } from '@brika/ui-kit';
import { getContext } from '../context';

/**
 * Define and register a brick type with the hub.
 *
 * @example
 * ```tsx
 * export const thermostat = defineBrick({
 *   id: 'thermostat',
 *   name: 'Thermostat',
 *   icon: 'thermometer',
 *   families: ['sm', 'md', 'lg'],
 *   config: [
 *     { type: 'text', name: 'room', required: true },
 *   ],
 * }, ({ family, config }) => {
 *   const [heating, setHeating] = useState(false);
 *
 *   useAction('toggle-heat', (p) => {
 *     setHeating(p?.checked as boolean ?? !heating);
 *   });
 *
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
  const brick: CompiledBrickType = { spec, component };

  try {
    getContext().registerBrickType(brick);
  } catch {
    // Context may not be available during testing or when imported outside plugin runtime
  }

  return brick;
}
