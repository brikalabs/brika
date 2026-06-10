/**
 * Device-family registry composition.
 *
 * Each file under `families/` is one self-contained device family (device-type
 * ids + cluster readers + command executors). This module composes them into
 * the flat structures the engine consumes:
 *
 *   - `DEVICE_TYPE_MAP`: Matter device-type id -> simplified category, merged
 *     across families (a duplicate id claim throws at module load),
 *   - `CLUSTER_ENTRIES`: every cluster entry in family order. Read order
 *     matters: later entries may overwrite shared keys (sensors after
 *     thermostat, so a standalone temperature measurement wins over a
 *     thermostat's local one),
 *   - `CLASSIFICATION_HINTS`: cluster-state fallback classification, sorted by
 *     each hint's explicit priority (NOT family order; see
 *     {@link ClassificationHint}),
 *   - `getClusterCommand`: command-name -> executor lookup (a duplicate
 *     command name throws at module load).
 *
 * Adding a device family = create `families/<name>.ts` + add it to `FAMILIES`.
 */

import { bridge } from './families/bridge';
import { cover } from './families/cover';
import { fan } from './families/fan';
import { light } from './families/light';
import { lock } from './families/lock';
import { sensors } from './families/sensors';
import { switchFamily } from './families/switch';
import { thermostat } from './families/thermostat';
import { vacuum } from './families/vacuum';
import type {
  ClassificationHint,
  ClusterCommand,
  ClusterEntry,
  DeviceFamily,
  DeviceType,
  MatterCommand,
} from './types';

export * from './types';

/** Every supported device family. Composition order is read order. */
export const FAMILIES: readonly DeviceFamily[] = [
  light,
  lock,
  cover,
  thermostat,
  switchFamily,
  sensors,
  fan,
  vacuum,
  bridge,
];

function buildDeviceTypeMap(
  families: readonly DeviceFamily[]
): Readonly<Record<number, DeviceType>> {
  const map: Record<number, DeviceType> = {};
  const owners = new Map<number, string>();
  for (const family of families) {
    for (const [idText, type] of Object.entries(family.deviceTypeIds)) {
      const id = Number(idText);
      const owner = owners.get(id);
      if (owner !== undefined) {
        throw new Error(
          `Matter device-type id 0x${id.toString(16).padStart(4, '0')} is claimed by both ` +
            `the "${owner}" and "${family.id}" families`
        );
      }
      owners.set(id, family.id);
      map[id] = type;
    }
  }
  return map;
}

function buildCommandIndex(
  entries: readonly ClusterEntry[]
): ReadonlyMap<MatterCommand, ClusterCommand> {
  const index = new Map<MatterCommand, ClusterCommand>();
  for (const entry of entries) {
    for (const command of entry.commands ?? []) {
      if (index.has(command.name)) {
        throw new Error(`Matter command "${command.name}" has more than one executor`);
      }
      index.set(command.name, command);
    }
  }
  return index;
}

/** Known Matter device type IDs -> our simplified categories. */
export const DEVICE_TYPE_MAP: Readonly<Record<number, DeviceType>> = buildDeviceTypeMap(FAMILIES);

/** Every cluster entry, in family (= state read) order. */
export const CLUSTER_ENTRIES: readonly ClusterEntry[] = FAMILIES.flatMap(
  (family) => family.clusters
);

/** Fallback classification hints, highest priority (lowest number) first. */
export const CLASSIFICATION_HINTS: readonly ClassificationHint[] = CLUSTER_ENTRIES.flatMap(
  (entry) => entry.classify ?? []
).sort((a, b) => a.priority - b.priority);

const COMMAND_INDEX = buildCommandIndex(CLUSTER_ENTRIES);

/** Look up a command's executor across the whole registry. */
export function getClusterCommand(name: MatterCommand): ClusterCommand | undefined {
  return COMMAND_INDEX.get(name);
}
