/**
 * Matter Controller
 *
 * Wraps matter.js CommissioningController to discover, commission,
 * and control Matter devices on the local network.
 *
 * This file owns lifecycle, node connections/subscriptions, and the notify
 * channels. Cluster specifics live in the registry (`clusters.ts`), the
 * device cache refresh in `device-model.ts`, and button-press normalization
 * in `press-tracker.ts`; the types they define are re-exported here so
 * existing imports keep working.
 *
 * Storage is handled by matter.js internally via Environment/StorageService,
 * pointed at our plugin's data directory.
 */

import { log } from '@brika/sdk/lifecycle';
import { getDataDir } from '@brika/sdk/storage';
import { Environment, Filesystem, Seconds, StorageService } from '@matter/main';
import { GeneralCommissioning } from '@matter/main/clusters';
import { ManualPairingCodeCodec, NodeId, QrPairingCodeCodec, VendorId } from '@matter/main/types';
import { NodeJsFilesystem } from '@matter/nodejs';
import { CommissioningController, type NodeCommissioningOptions } from '@project-chip/matter.js';
import { NodeStates, type PairedNode } from '@project-chip/matter.js/device';
import { getClusterCommand, type MatterCommand } from './clusters';
import {
  type MatterDevice,
  type MatterDeviceEvent,
  refreshNodeDevices,
  removeNodeEntries,
} from './device-model';
import {
  createPressTracker,
  type NormalizedPress,
  type PressType,
  SWITCH_PRESS_EVENTS,
} from './press-tracker';

export type { DeviceType, MatterCommand, MatterEndpoint } from './clusters';
export { MATTER_COMMAND_VALUES } from './clusters';
export type { MatterDevice, MatterDeviceEvent } from './device-model';
export type { PressType } from './press-tracker';

/** A normalized, user-level button press; see {@link press-tracker}. */
export interface MatterButtonPress {
  /** Device id of the button device (or its named parent on the re-emission). */
  nodeId: string;
  /** Device display name. */
  name: string;
  /** 1-based button number within the device. */
  button: number;
  /** Normalized gesture. */
  press: PressType;
  /** Number of presses in the gesture (2 for double, 3 for triple, ...). */
  count: number;
}

type DeviceCallback = (device: MatterDevice) => void;

const CONTROLLER_VENDOR_NAME = 'Brika';
const CONTROLLER_NAME = 'Brika Matter';
const CONTROLLER_VENDOR_ID = VendorId(0xfff1);
const CONTROLLER_PRODUCT_ID = 0x8000;
const CONTROLLER_STORAGE_ID = 'brika-matter-controller';

// ─── Controller ──────────────────────────────────────────────────────────────

export class MatterController {
  #controller?: CommissioningController;
  readonly #onStateChanged = new Set<DeviceCallback>();
  readonly #onDeviceEvent = new Set<(event: MatterDeviceEvent) => void>();
  readonly #onButtonPress = new Set<(press: MatterButtonPress) => void>();
  readonly #onDiscovered = new Set<DeviceCallback>();
  readonly #pairedNodes = new Map<string, PairedNode>();
  readonly #deviceCache = new Map<string, MatterDevice>();
  readonly #pressTracker = createPressTracker((deviceId, press) =>
    this.#dispatchButtonPress(deviceId, press)
  );
  #started = false;

  async start(): Promise<void> {
    // Already running. Require both flags so a previously failed start (which
    // resets #started) can be retried instead of being wedged forever.
    if (this.#started && this.#controller) {
      return;
    }

    log.info('Matter controller starting...');

    try {
      await this.#startInternal();
      this.#started = true;
      log.info('Matter controller started');
    } catch (err) {
      // Reset so a later start() (e.g. triggered by a commission attempt or a
      // plugin reload) can retry, and surface the real matter.js cause rather
      // than leaving callers with the opaque "not yet started" guard.
      this.#started = false;
      this.#controller = undefined;
      log.error(`Matter controller failed to start: ${describeError(err)}`);
      throw err;
    }
  }

  async #startInternal(): Promise<void> {
    // Configure environment with our data dir as storage. matter.js 0.17
    // made `StorageService.location` a getter-only property; the previous
    // direct assignment (`environment.get(StorageService).location = ...`)
    // throws `Attempted to assign to readonly property`. Register a
    // `NodeJsFilesystem` rooted at our data dir instead: `StorageService`
    // reads the path back through `environment.get(Filesystem).path`.
    const dataDir = getDataDir();
    const environment = Environment.default;
    environment.set(Filesystem, new NodeJsFilesystem(dataDir));
    // Touch the service so the previous `.location` access pattern stays
    // a no-op rather than dead-import. Throws nothing now that
    // `hasFilesystem` is true.
    environment.get(StorageService);

    log.info(`Matter storage: ${dataDir}`);

    // Create the CommissioningController
    this.#controller = new CommissioningController({
      environment: {
        environment,
        id: CONTROLLER_STORAGE_ID,
      },
      autoConnect: false,
      adminVendorId: CONTROLLER_VENDOR_ID,
      adminFabricLabel: CONTROLLER_NAME,
      basicInformation: {
        vendorName: CONTROLLER_VENDOR_NAME,
        productName: CONTROLLER_NAME,
        productId: CONTROLLER_PRODUCT_ID,
      },
    });

    await this.#controller.start();
    await this.#controller.updateFabricLabel(CONTROLLER_NAME);

    // Reconnect to any previously commissioned nodes
    const nodeIds = this.#controller.getCommissionedNodes();
    log.info(`Found ${nodeIds.length} commissioned node(s)`);

    for (const nodeId of nodeIds) {
      try {
        await this.#connectNode(nodeId);
        await this.#controller.validateAndUpdateFabricLabel(nodeId);
      } catch (err) {
        log.warn(`Failed to connect to node ${nodeId}: ${err}`);
      }
    }
  }

  async stop(): Promise<void> {
    if (!this.#started || !this.#controller) {
      return;
    }
    this.#started = false;

    await this.#controller.close();
    this.#pairedNodes.clear();
    this.#deviceCache.clear();
    log.info('Matter controller stopped');
  }

  // ─── Discovery ─────────────────────────────────────────────────────────────

  async discover(): Promise<MatterDevice[]> {
    await this.start();
    if (!this.#controller) {
      throw new Error('Controller not started');
    }

    log.info('Scanning for commissionable Matter devices...');

    const discovered = await this.#controller.discoverCommissionableDevices(
      {}, // empty = discover all
      undefined,
      (device) => {
        log.info(
          `Discovered: ${device.deviceIdentifier ?? device.DN ?? 'unknown'} (discriminator: ${device.D})`
        );
        const matterDevice: MatterDevice = {
          nodeId: `discovered-${device.D}`,
          name: device.DN ?? device.deviceIdentifier ?? `Device (${device.D})`,
          deviceType: 'unknown',
          online: true,
          commissioned: false,
          state: {},
          commands: [],
          discriminator: device.D,
        };
        for (const cb of this.#onDiscovered) {
          cb(matterDevice);
        }
      },
      Seconds(10)
    );

    log.info(`Discovery complete: ${discovered.length} device(s) found`);

    return discovered.map((d) => ({
      nodeId: `discovered-${d.D}`,
      name: d.DN ?? d.deviceIdentifier ?? `Device (${d.D})`,
      deviceType: 'unknown' as const,
      online: true,
      commissioned: false,
      state: {},
      commands: [],
      discriminator: d.D,
    }));
  }

  async commission(pairingCode: string): Promise<string> {
    await this.start();
    if (!this.#controller) {
      throw new Error('Controller not started');
    }

    // Never log the pairing code: it is the device commissioning secret and the
    // hub persists log message text verbatim to logs.db.
    log.info('Commissioning device from pairing code');

    try {
      const options = decodePairingCode(pairingCode);
      const nodeId = await this.#controller.commissionNode(options);
      log.info(`Commissioned node: ${nodeId}`);

      await this.#connectNode(nodeId);
      await this.#controller.validateAndUpdateFabricLabel(nodeId);

      const device = this.#deviceCache.get(String(nodeId));
      if (device) {
        for (const cb of this.#onStateChanged) {
          cb(device);
        }
      }

      return String(nodeId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Commission failed: ${message}`);
      if (err instanceof Error && err.stack) {
        log.error(err.stack);
      }
      throw new Error(`Commission failed: ${message}`);
    }
  }

  async removeDevice(deviceId: string): Promise<boolean> {
    if (!this.#controller) {
      return false;
    }

    // Resolve to the actual node ID (strip endpoint suffix for bridge children)
    const nodeId = deviceId.split(':')[0];
    const pairedNode = this.#pairedNodes.get(nodeId);
    if (!pairedNode) {
      return false;
    }

    try {
      await pairedNode.decommission();
    } catch (err) {
      log.warn(`Decommission error (removing anyway): ${err}`);
      await this.#controller.removeNode(NodeId(BigInt(nodeId)));
    }

    this.#pairedNodes.delete(nodeId);
    // Remove all cache entries for this node (including bridge children)
    removeNodeEntries(this.#deviceCache, nodeId);
    log.info(`Removed device: ${nodeId}`);
    return true;
  }

  // ─── Subscriptions ─────────────────────────────────────────────────────────

  onDeviceStateChanged(callback: DeviceCallback): () => void {
    this.#onStateChanged.add(callback);
    return () => this.#onStateChanged.delete(callback);
  }

  /** Subscribe to Matter EVENTS (button presses, alarms); see {@link MatterDeviceEvent}. */
  onDeviceEvent(callback: (event: MatterDeviceEvent) => void): () => void {
    this.#onDeviceEvent.add(callback);
    return () => this.#onDeviceEvent.delete(callback);
  }

  /**
   * Subscribe to NORMALIZED button presses (one per gesture: short, long,
   * double, triple, multi). Each press is emitted for the button device AND
   * for its named composed-device parent, mirroring raw device events.
   */
  onButtonPress(callback: (press: MatterButtonPress) => void): () => void {
    this.#onButtonPress.add(callback);
    return () => this.#onButtonPress.delete(callback);
  }

  onDeviceDiscovered(callback: DeviceCallback): () => void {
    this.#onDiscovered.add(callback);
    return () => this.#onDiscovered.delete(callback);
  }

  #dispatchDeviceEvent(event: MatterDeviceEvent): void {
    for (const cb of this.#onDeviceEvent) {
      cb(event);
    }
  }

  #emitButtonPress(press: MatterButtonPress): void {
    for (const cb of this.#onButtonPress) {
      cb(press);
    }
  }

  /** Fan a normalized press out to the button device and its named parent. */
  #dispatchButtonPress(deviceId: string, press: NormalizedPress): void {
    const device = this.#deviceCache.get(deviceId);
    const button = device?.button ?? 1;
    this.#emitButtonPress({
      nodeId: deviceId,
      name: device?.name ?? deviceId,
      button,
      press: press.press,
      count: press.count,
    });
    if (device?.parentId !== undefined) {
      const parent = this.#deviceCache.get(device.parentId);
      this.#emitButtonPress({
        nodeId: device.parentId,
        name: parent?.name ?? device.parentId,
        button,
        press: press.press,
        count: press.count,
      });
    }
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  getDevices(): MatterDevice[] {
    return [...this.#deviceCache.values()];
  }

  getCommissionedDevices(): MatterDevice[] {
    return this.getDevices().filter((d) => d.commissioned);
  }

  getDevice(nodeId: string): MatterDevice | undefined {
    return this.#deviceCache.get(nodeId);
  }

  // ─── Commands ──────────────────────────────────────────────────────────────

  async sendCommand(
    deviceId: string,
    command: MatterCommand,
    params?: Record<string, string>
  ): Promise<boolean> {
    await this.start();
    // deviceId can be "nodeId" or "nodeId:endpointNumber" (bridge children)
    const [nodeIdPart, epPart] = deviceId.split(':');
    const pairedNode = this.#pairedNodes.get(nodeIdPart);
    if (!pairedNode) {
      log.warn(`Node ${nodeIdPart} not found`);
      return false;
    }
    if (!pairedNode.isConnected) {
      log.warn(`Node ${nodeIdPart} is not connected`);
      return false;
    }

    log.info(`Sending "${command}" to device ${deviceId}`, params);

    try {
      // Resolve the correct endpoint (getDeviceById finds nested bridge children too)
      const endpoint = epPart
        ? pairedNode.getDeviceById(Number(epPart))
        : pairedNode.getDevices()[0];
      if (!endpoint) {
        log.warn(`Device ${deviceId} has no matching endpoint`);
        return false;
      }

      const clusterCommand = getClusterCommand(command);
      if (!clusterCommand) {
        log.warn(`Command "${command}" has no cluster executor`);
        return false;
      }
      await clusterCommand.execute(endpoint, params ?? {});

      // Refresh the device cache after command
      refreshNodeDevices(nodeIdPart, pairedNode, this.#deviceCache);
      return true;
    } catch (err) {
      log.warn(`Command "${command}" failed on device ${deviceId}: ${err}`);
      return false;
    }
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  /**
   * Notify callbacks for devices belonging to a node, scoped to one endpoint
   * when the report names it. An attribute report identifies the endpoint that
   * changed; only that bridged device's subscribers (plus the node-root
   * device's) should fire. Notifying every device on the node turned a single
   * Hue-bridge report into a trigger fan-out: a workflow watching one dimmer
   * fired whenever ANY light on the bridge changed, so an agent that controls
   * lights kept re-triggering its own workflow in a feedback loop.
   */
  #notifyNodeDevices(nodeIdStr: string, endpointId?: number): void {
    const scoped = endpointId === undefined ? undefined : `${nodeIdStr}:${endpointId}`;
    for (const device of this.#deviceCache.values()) {
      const onNode = device.nodeId === nodeIdStr || device.nodeId.startsWith(`${nodeIdStr}:`);
      const inScope =
        scoped === undefined || device.nodeId === scoped || device.nodeId === nodeIdStr;
      if (onNode && inScope) {
        for (const cb of this.#onStateChanged) {
          cb(device);
        }
      }
    }
  }

  async #connectNode(nodeId: NodeId): Promise<void> {
    if (!this.#controller) {
      return;
    }

    const node = await this.#controller.getNode(nodeId);
    const nodeIdStr = String(nodeId);
    this.#pairedNodes.set(nodeIdStr, node);

    // Subscribe to attribute changes
    node.events.attributeChanged.on(({ path, value }) => {
      log.info(
        `Attribute changed on ${nodeIdStr}: ${path.endpointId}/${path.clusterId}/${path.attributeName} = ${value}`
      );
      refreshNodeDevices(nodeIdStr, node, this.#deviceCache);
      this.#notifyNodeDevices(nodeIdStr, Number(path.endpointId));
    });

    // Subscribe to Matter EVENTS (button presses on switches/dimmers, lock
    // alarms, ...). Unlike attributes these are one-shot signals: a Hue dimmer
    // press surfaces ONLY here (its state carries no press information).
    node.events.eventTriggered.on((report) => {
      const endpointId = Number(report.path.endpointId);
      const scoped = `${nodeIdStr}:${endpointId}`;
      const deviceId = this.#deviceCache.has(scoped) ? scoped : nodeIdStr;
      log.info(`Event on ${deviceId}: ${report.path.eventName}`);
      for (const entry of report.events) {
        this.#dispatchScopedEvent(deviceId, report.path.eventName, flattenEventData(entry.data));
      }
    });

    // Subscribe to endpoint structure changes (bridges add children after init)
    node.events.structureChanged.on(() => {
      const endpoints = node.getDevices();
      log.info(`Structure changed on ${nodeIdStr}: now ${endpoints.length} endpoint(s)`);
      refreshNodeDevices(nodeIdStr, node, this.#deviceCache);
      this.#notifyNodeDevices(nodeIdStr);
    });

    // Subscribe to connection state changes
    node.events.stateChanged.on((state) => {
      this.#handleConnectionChange(nodeIdStr, node, state);
    });

    // Connect and wait for initialization
    if (!node.isConnected) {
      node.connect();
    }

    if (!node.initialized) {
      try {
        await node.events.initialized;
      } catch (err) {
        log.warn(`Node ${nodeIdStr} initialization failed: ${err}`);
      }
    }

    // Build initial device state
    refreshNodeDevices(nodeIdStr, node, this.#deviceCache);
    log.info(`Connected to node ${nodeIdStr} (${node.getDevices().length} endpoint(s))`);
  }

  /**
   * Dispatch one raw device event: to the device itself, re-emitted on its
   * named composed-device parent (with the button number so users can watch
   * the device they recognize, not "button 3"), and into the press tracker
   * when it is a switch press event.
   */
  #dispatchScopedEvent(deviceId: string, eventName: string, data: Record<string, string>): void {
    const device = this.#deviceCache.get(deviceId);
    this.#dispatchDeviceEvent({
      nodeId: deviceId,
      name: device?.name ?? deviceId,
      event: eventName,
      data,
    });
    if (device?.parentId !== undefined) {
      const parent = this.#deviceCache.get(device.parentId);
      this.#dispatchDeviceEvent({
        nodeId: device.parentId,
        name: parent?.name ?? device.parentId,
        event: eventName,
        data: device.button === undefined ? data : { ...data, button: String(device.button) },
      });
    }
    if (SWITCH_PRESS_EVENTS.has(eventName)) {
      this.#pressTracker.handle(deviceId, eventName, data);
    }
  }

  #handleConnectionChange(nodeIdStr: string, node: PairedNode, state: NodeStates): void {
    const online = state === NodeStates.Connected;
    for (const device of this.#deviceCache.values()) {
      if (device.nodeId === nodeIdStr || device.nodeId.startsWith(`${nodeIdStr}:`)) {
        const wasOnline = device.online;
        device.online = online;
        if (wasOnline !== online) {
          for (const cb of this.#onStateChanged) {
            cb(device);
          }
        }
      }
    }
    if (online !== node.isConnected) {
      log.info(`Node ${nodeIdStr} ${online ? 'connected' : 'disconnected'}`);
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Decode a QR or manual pairing code into commissioning options. */
function decodePairingCode(pairingCode: string): NodeCommissioningOptions {
  const commissioning = {
    regulatoryLocation: GeneralCommissioning.RegulatoryLocationType.IndoorOutdoor,
    regulatoryCountryCode: 'XX',
  };

  if (pairingCode.startsWith('MT:')) {
    const [qrData] = QrPairingCodeCodec.decode(pairingCode);
    // Log only the non-secret discriminator; the passcode is the device PIN.
    log.info(`Decoded QR code, discriminator: ${qrData.discriminator}`);
    return {
      commissioning,
      discovery: { identifierData: { longDiscriminator: qrData.discriminator } },
      passcode: qrData.passcode,
    };
  }

  const manualData = ManualPairingCodeCodec.decode(pairingCode);
  // Log only the non-secret discriminator; the passcode is the device PIN.
  log.info(`Decoded manual code, discriminator: ${manualData.shortDiscriminator}`);
  return {
    commissioning,
    discovery: { identifierData: { shortDiscriminator: manualData.shortDiscriminator } },
    passcode: manualData.passcode,
  };
}

/** Stringify one event-payload value without `[object Object]` artifacts. */
function stringifyShallow(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}

/** Flatten a Matter event payload to the string map carried by {@link MatterDeviceEvent}. */
function flattenEventData(data: unknown): Record<string, string> {
  if (data === null || data === undefined) {
    return {};
  }
  if (typeof data !== 'object') {
    return { value: stringifyShallow(data) };
  }
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    flat[key] = stringifyShallow(value);
  }
  return flat;
}

/** Serialize an error including its full `cause` chain (matter.js hides the
 * real failure under a generic wrapper, attaching the true error as `cause`). */
function describeError(err: unknown, depth = 0): string {
  if (!(err instanceof Error)) {
    return String(err);
  }
  const head = err.stack ?? `${err.name}: ${err.message}`;
  if (err.cause !== undefined && depth < 5) {
    return `${head}\n  caused by: ${describeError(err.cause, depth + 1)}`;
  }
  return head;
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let controller: MatterController | null = null;

export function getMatterController(): MatterController {
  controller ??= new MatterController();
  return controller;
}
