/**
 * Matter device model: types, device-type classification, and the refresh
 * logic that turns a paired node's endpoint tree into the flat device cache
 * the rest of the plugin consumes.
 *
 * Everything cluster-specific (state mapping, commands, classification hints)
 * lives in the device-family registry (`../registry`); this module only
 * iterates its composed structures.
 */

import { log } from '@brika/sdk/lifecycle';
import { BridgedDeviceBasicInformationClient } from '@matter/main/behaviors/bridged-device-basic-information';
import type { PairedNode } from '@project-chip/matter.js/device';
import {
  CLASSIFICATION_HINTS,
  CLUSTER_ENTRIES,
  DEVICE_TYPE_MAP,
  type DeviceType,
  type MatterCommand,
  type MatterEndpoint,
  type MatterState,
  parseStateSlice,
} from '../registry';

export type { DeviceType, MatterState } from '../registry';

export interface MatterDevice {
  nodeId: string;
  name: string;
  deviceType: DeviceType;
  online: boolean;
  commissioned: boolean;
  state: MatterState;
  /** Commands this device's clusters actually support (drives UI + AI tools). */
  commands: MatterCommand[];
  /** For button endpoints of a composed device: the named parent's device id. */
  parentId?: string;
  /** For button endpoints: 1-based button number within the parent device. */
  button?: number;
  discriminator?: number;
  vendor?: string;
  product?: string;
  serial?: string;
  softwareVersion?: string;
}

/**
 * A Matter EVENT (as opposed to an attribute change): button presses on
 * switches/dimmers (`initialPress`, `shortRelease`, `longPress`,
 * `multiPressComplete`, ...), lock alarms, and similar one-shot signals.
 * These never appear in `state`; they are only observable as they happen.
 */
export interface MatterDeviceEvent {
  /** Device id, `nodeId` or `nodeId:endpoint` for bridged children. */
  nodeId: string;
  /** Device display name. */
  name: string;
  /** Matter event name, e.g. `initialPress`. */
  event: string;
  /** Event payload flattened to strings (e.g. `{ "newPosition": "1" }`). */
  data: Record<string, string>;
}

// ─── Device Type Mapping ─────────────────────────────────────────────────────

/** Classify a single device type ID */
function classifyDeviceType(deviceTypeId: number): DeviceType | undefined {
  return DEVICE_TYPE_MAP[deviceTypeId];
}

/** Pick the best matching type from a list of device type IDs */
export function classifyDeviceTypes(deviceTypeIds: number[]): DeviceType {
  for (const id of deviceTypeIds) {
    const type = classifyDeviceType(id);
    if (type) {
      return type;
    }
  }
  return 'unknown';
}

/**
 * Classify an endpoint from the cluster state it exposes, for endpoints whose
 * deviceTypeList carries only structural types. Hue bridges label e.g. a
 * dimmer or wall-switch-module endpoint with just `0x0013` (Bridged Node) +
 * `0x0011` (Power Source), so the id-based map yields 'unknown' even though
 * the device plainly has a Switch cluster. Priority is each hint's explicit
 * rank (the registry sorts them; switch leads so Hue dimmer button endpoints
 * never classify as lights).
 */
export function classifyFromState(state: MatterState): DeviceType {
  for (const hint of CLASSIFICATION_HINTS) {
    if (hint.keys.some((key) => key in state)) {
      return hint.type;
    }
  }
  return 'unknown';
}

// ─── Endpoint Reading ────────────────────────────────────────────────────────

/**
 * Read every registered cluster's state from an endpoint into typed state.
 * Each reader writes a raw slice that is immediately schema-parsed
 * ({@link parseStateSlice}): a malformed cluster value drops that attribute
 * only, so one misbehaving cluster can never crash a refresh.
 */
export function readEndpointState(ep: MatterEndpoint): MatterState {
  const state: MatterState = {};
  for (const entry of CLUSTER_ENTRIES) {
    if (!entry.read) {
      continue;
    }
    const slice: Record<string, unknown> = {};
    try {
      entry.read(ep, slice);
    } catch {
      continue; /* cluster not present */
    }
    Object.assign(state, parseStateSlice(slice));
  }
  return state;
}

/**
 * Derive the commands a device supports from the cluster state it exposes.
 * Drives the `commands` field on {@link MatterDevice}: the UI and AI tools
 * only offer (and accept) what the device can actually do.
 */
export function deriveCommands(state: MatterState): MatterCommand[] {
  const commands: MatterCommand[] = [];
  for (const entry of CLUSTER_ENTRIES) {
    for (const command of entry.commands ?? []) {
      if (command.when in state) {
        commands.push(command.name);
      }
    }
  }
  return commands;
}

// ─── Endpoint Tree ───────────────────────────────────────────────────────────

/** An endpoint plus its tree parent (composed devices nest buttons under a named parent). */
export interface EndpointEntry {
  ep: MatterEndpoint;
  parent?: MatterEndpoint;
}

/** Recursively collect all device endpoints (bridges expose children under the aggregator) */
export function collectAllEndpoints(topEndpoints: MatterEndpoint[]): EndpointEntry[] {
  const all: EndpointEntry[] = [];
  const collect = (ep: MatterEndpoint, parent?: MatterEndpoint) => {
    all.push({ ep, parent });
    try {
      for (const child of ep.getChildEndpoints()) {
        collect(child, ep);
      }
    } catch {
      /* no children */
    }
  };
  for (const ep of topEndpoints) {
    collect(ep);
  }
  return all;
}

interface BridgedInfo {
  epName?: string;
  vendor?: string;
  product?: string;
  serial?: string;
  softwareVersion?: string;
}

/** Endpoint metadata from the BridgedDeviceBasicInformation cluster, if present. */
export function readBridgedInfo(ep: MatterEndpoint): BridgedInfo {
  try {
    const bridgedInfo = ep.maybeStateOf(BridgedDeviceBasicInformationClient);
    if (bridgedInfo) {
      return {
        epName: bridgedInfo.nodeLabel ?? bridgedInfo.productName,
        vendor: bridgedInfo.vendorName,
        product: bridgedInfo.productName,
        serial: bridgedInfo.serialNumber,
        softwareVersion: bridgedInfo.softwareVersionString,
      };
    }
  } catch {
    /* not a bridged endpoint */
  }
  return {};
}

/**
 * Identity of a composed-device button endpoint. Composed devices (a Hue
 * dimmer/wall module) name only the parent endpoint; their button endpoints
 * carry no label of their own. Naming them after the parent makes a dropdown
 * read "Hue dimmer switch 1 button 2" instead of "BSB003 #24".
 */
export function composedButtonIdentity(
  nodeIdStr: string,
  parent: MatterEndpoint | undefined,
  buttonCounters: Map<unknown, number>
): { parentId: string; button: number; name: string } | undefined {
  if (parent === undefined) {
    return undefined;
  }
  const parentName = readBridgedInfo(parent).epName;
  if (parentName === undefined) {
    return undefined;
  }
  const button = (buttonCounters.get(parent) ?? 0) + 1;
  buttonCounters.set(parent, button);
  return {
    parentId: `${nodeIdStr}:${parent.number}`,
    button,
    name: `${parentName} button ${button}`,
  };
}

// ─── Device Cache Refresh ────────────────────────────────────────────────────

/** Remove all cache entries for a node (root device and bridged children). */
export function removeNodeEntries(cache: Map<string, MatterDevice>, nodeIdStr: string): void {
  for (const key of cache.keys()) {
    if (key === nodeIdStr || key.startsWith(`${nodeIdStr}:`)) {
      cache.delete(key);
    }
  }
}

interface ClassifiedEndpoint extends EndpointEntry {
  deviceType: DeviceType;
}

function classifyEndpoint(entry: EndpointEntry): ClassifiedEndpoint {
  const deviceTypes = entry.ep.state?.descriptor?.deviceTypeList;
  let deviceType: DeviceType = 'unknown';
  if (deviceTypes?.length) {
    const ids = deviceTypes.map((dt) => Number(dt.deviceType));
    for (const id of ids) {
      log.debug(
        `  ep${entry.ep.number} device type: 0x${id.toString(16).padStart(4, '0')} (${id})`
      );
    }
    deviceType = classifyDeviceTypes(ids);
  }
  return { ...entry, deviceType };
}

interface NodeContext {
  nodeIdStr: string;
  online: boolean;
  hasMultiple: boolean;
  info: PairedNode['basicInformation'];
  /**
   * 1-based button counters per composed-device parent (Hue remotes expose
   * one nameless generic-switch endpoint per physical button).
   */
  buttonCounters: Map<unknown, number>;
}

function buildEndpointDevice(ctx: NodeContext, classified: ClassifiedEndpoint): MatterDevice {
  const { ep, parent, deviceType } = classified;
  const epNumber = ep.number;
  // Bridge gets root nodeId so children (nodeId:ep) can be matched by prefix
  const isChild = ctx.hasMultiple && deviceType !== 'bridge';
  const deviceId = isChild ? `${ctx.nodeIdStr}:${epNumber}` : ctx.nodeIdStr;

  const state = readEndpointState(ep);
  // Bridges often tag endpoints with only structural device types
  // (Bridged Node, Power Source); fall back to cluster-based classification.
  const resolvedType = deviceType === 'unknown' ? classifyFromState(state) : deviceType;

  // Endpoint metadata: try bridged device info, fall back to node-level
  let { epName, vendor, product, serial, softwareVersion } = readBridgedInfo(ep);
  const composed = composedButtonIdentity(ctx.nodeIdStr, parent, ctx.buttonCounters);
  epName ??= composed?.name;
  epName ??= ctx.hasMultiple ? `${ctx.info?.productName ?? 'Device'} #${epNumber}` : undefined;
  epName ??= ctx.info?.productName ?? ctx.info?.nodeLabel ?? `Device ${ctx.nodeIdStr}`;
  vendor ??= ctx.info?.vendorName;
  product ??= ctx.info?.productName;
  serial ??= ctx.info?.serialNumber;
  softwareVersion ??= ctx.info?.softwareVersionString;

  return {
    nodeId: deviceId,
    name: epName,
    deviceType: resolvedType,
    online: ctx.online,
    commissioned: true,
    state,
    commands: deriveCommands(state),
    parentId: composed?.parentId,
    button: composed?.button,
    vendor,
    product,
    serial,
    softwareVersion,
  };
}

/**
 * A composed device's named parent endpoint exposes only structural
 * clusters, so it classifies as 'unknown' even though its button children
 * are switches. Promote it to 'switch' so the human-named device (the one
 * users pick) shows up under the right category.
 */
function promoteComposedParents(cache: Map<string, MatterDevice>, nodeIdStr: string): void {
  for (const device of cache.values()) {
    if (!device.parentId?.startsWith(nodeIdStr)) {
      continue;
    }
    const parent = cache.get(device.parentId);
    if (parent?.deviceType === 'unknown' && device.deviceType === 'switch') {
      parent.deviceType = 'switch';
    }
  }
}

/** Rebuild the device cache entries for one node from its endpoint tree. */
export function refreshNodeDevices(
  nodeIdStr: string,
  node: PairedNode,
  cache: Map<string, MatterDevice>
): void {
  const info = node.basicInformation;
  const topEndpoints = node.getDevices();
  const allEndpoints = collectAllEndpoints(topEndpoints);

  log.info(
    `Node ${nodeIdStr}: ${topEndpoints.length} top-level, ${allEndpoints.length} total endpoint(s)`
  );

  // Remove stale entries for this node before rebuilding
  removeNodeEntries(cache, nodeIdStr);

  if (allEndpoints.length === 0) {
    // No endpoints: store a placeholder
    cache.set(nodeIdStr, {
      nodeId: nodeIdStr,
      name: info?.productName ?? info?.nodeLabel ?? `Device ${nodeIdStr}`,
      deviceType: 'unknown',
      online: node.isConnected,
      commissioned: true,
      state: {},
      commands: [],
    });
    return;
  }

  const classified = allEndpoints.map((entry) => classifyEndpoint(entry));
  const ctx: NodeContext = {
    nodeIdStr,
    online: node.isConnected,
    hasMultiple: classified.length > 1,
    info,
    buttonCounters: new Map(),
  };

  for (const entry of classified) {
    const device = buildEndpointDevice(ctx, entry);
    cache.set(device.nodeId, device);
  }

  promoteComposedParents(cache, nodeIdStr);
}
