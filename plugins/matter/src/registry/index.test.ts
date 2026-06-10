/**
 * Registry composition guardrails: the invariants that make "add a device
 * family" a safe, one-module change. If any of these fail, the new family
 * collides with an existing one or forgot one of its three touchpoints.
 */

import { describe, expect, test } from 'bun:test';
import { ATTRIBUTE_BY_KEY } from '../display/attributes';
import {
  CLASSIFICATION_HINTS,
  CLUSTER_ENTRIES,
  DEVICE_TYPE_MAP,
  FAMILIES,
  getClusterCommand,
  MATTER_COMMAND_VALUES,
  MatterStateSchema,
} from './index';

describe('device-family registry', () => {
  test('no duplicate device-type ids across families', () => {
    const ids = FAMILIES.flatMap((family) => Object.keys(family.deviceTypeIds));
    expect(new Set(ids).size).toBe(ids.length);
    // The merged map carries every claimed id (composition would have thrown
    // on a collision; this guards against silent key loss too).
    expect(Object.keys(DEVICE_TYPE_MAP).length).toBe(ids.length);
  });

  test('no duplicate command names across cluster entries', () => {
    const names = CLUSTER_ENTRIES.flatMap((entry) =>
      (entry.commands ?? []).map((command) => command.name)
    );
    expect(new Set(names).size).toBe(names.length);
  });

  test('every declared command has exactly one executor', () => {
    for (const name of MATTER_COMMAND_VALUES) {
      const command = getClusterCommand(name);
      expect(command).toBeDefined();
      expect(typeof command?.execute).toBe('function');
    }
    // And no executor exists outside the declared command vocabulary: the
    // ClusterCommand.name type enforces it, the count proves nothing leaked.
    const executors = CLUSTER_ENTRIES.flatMap((entry) => entry.commands ?? []);
    expect(executors.length).toBe(MATTER_COMMAND_VALUES.length);
  });

  test('every state key a reader can produce has a display ATTRIBUTES entry', () => {
    // Readers' slices are filtered through MatterStateSchema (parseStateSlice),
    // so the schema's keys ARE the complete reader-producible vocabulary.
    for (const key of Object.keys(MatterStateSchema.shape)) {
      expect(ATTRIBUTE_BY_KEY[key], `state key "${key}" has no ATTRIBUTES entry`).toBeDefined();
    }
  });

  test('classification hints and command gates only reference schema state keys', () => {
    // A family whose reader writes a key missing from MatterStateSchema would
    // see it silently dropped; its classify/when keys are the declared intent,
    // so requiring them in the schema catches the forgotten schema field.
    const schemaKeys = new Set(Object.keys(MatterStateSchema.shape));
    for (const hint of CLASSIFICATION_HINTS) {
      for (const key of hint.keys) {
        expect(schemaKeys.has(key), `classify key "${key}" missing from MatterStateSchema`).toBe(
          true
        );
      }
    }
    for (const entry of CLUSTER_ENTRIES) {
      for (const command of entry.commands ?? []) {
        expect(
          schemaKeys.has(command.when),
          `command "${command.name}" gates on "${command.when}", missing from MatterStateSchema`
        ).toBe(true);
      }
    }
  });

  test('classification priority keeps switch ahead of light', () => {
    // Wall switch modules expose both Switch and OnOff clusters; the switch
    // hint must win or they (and Hue dimmer buttons) classify as lights.
    const firstSwitch = CLASSIFICATION_HINTS.findIndex((hint) => hint.type === 'switch');
    const firstLight = CLASSIFICATION_HINTS.findIndex((hint) => hint.type === 'light');
    expect(firstSwitch).toBeGreaterThanOrEqual(0);
    expect(firstLight).toBeGreaterThanOrEqual(0);
    expect(firstSwitch).toBeLessThan(firstLight);
  });
});
