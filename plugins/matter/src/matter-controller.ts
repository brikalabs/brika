/**
 * Matter Controller
 *
 * Wraps matter.js CommissioningController to discover, commission,
 * and control Matter devices on the local network.
 *
 * Storage is handled by matter.js internally via Environment/StorageService,
 * pointed at our plugin's data directory.
 */

import { BridgedDeviceBasicInformationClient } from '@matter/main/behaviors/bridged-device-basic-information';
import { DoorLockClient } from '@matter/main/behaviors/door-lock';
import { LevelControlClient } from '@matter/main/behaviors/level-control';
import { OnOffClient } from '@matter/main/behaviors/on-off';
import { ThermostatClient } from '@matter/main/behaviors/thermostat';
import { WindowCoveringClient } from '@matter/main/behaviors/window-covering';
import { DoorLock, GeneralCommissioning, Thermostat } from '@matter/main/clusters';
import { ManualPairingCodeCodec, QrPairingCodeCodec, NodeId } from '@matter/main/types';
import { Environment, Seconds, StorageService } from '@matter/main';
import { CommissioningController, type NodeCommissioningOptions } from '@project-chip/matter.js';
import { NodeStates, type PairedNode } from '@project-chip/matter.js/device';
import { log } from '@brika/sdk/lifecycle';
import { getDataDir } from '@brika/sdk/storage';

// ─── Types ───────────────────────────────────────────────────────────────────

export type DeviceType = 'light' | 'lock' | 'cover' | 'thermostat' | 'switch' | 'sensor' | 'bridge' | 'unknown';

export interface MatterDevice {
  nodeId: string;
  name: string;
  deviceType: DeviceType;
  online: boolean;
  commissioned: boolean;
  state: Record<string, unknown>;
  discriminator?: number;
  vendor?: string;
  product?: string;
  serial?: string;
  softwareVersion?: string;
}

export type MatterCommand =
  | 'on' | 'off' | 'toggle'
  | 'setBrightness' | 'setColorTemp' | 'setHueSaturation'
  | 'lock' | 'unlock'
  | 'coverOpen' | 'coverClose' | 'coverStop'
  | 'setTargetTemp';

type DeviceCallback = (device: MatterDevice) => void;

// ─── Device Type Mapping ─────────────────────────────────────────────────────

/** Known Matter device type IDs → our simplified categories */
const DEVICE_TYPE_MAP: Record<number, DeviceType> = {
  // Bridges / Aggregators
  0x000e: 'bridge', // Aggregator (e.g. Hue Bridge)
  // Lights
  0x0100: 'light', // On/Off Light
  0x0101: 'light', // Dimmable Light
  0x010c: 'light', // Color Temperature Light
  0x010d: 'light', // Extended Color Light
  // Locks
  0x000a: 'lock', // Door Lock
  0x000b: 'lock', // Door Lock Controller
  // Window coverings
  0x0202: 'cover', // Window Covering
  // Thermostats
  0x0301: 'thermostat', // Thermostat
  // Switches
  0x0103: 'switch', // On/Off Light Switch
  0x0104: 'switch', // Dimmer Switch
  0x0105: 'switch', // Color Dimmer Switch
  0x000f: 'switch', // Generic Switch
  // Sensors
  0x0107: 'sensor', // Occupancy Sensor
  0x0106: 'sensor', // Light Sensor
  0x0302: 'sensor', // Temperature Sensor
  0x0305: 'sensor', // Humidity Sensor
  0x0850: 'sensor', // Contact Sensor
};

/** Classify a single device type ID */
function classifyDeviceType(deviceTypeId: number): DeviceType | undefined {
  return DEVICE_TYPE_MAP[deviceTypeId];
}

/** Pick the best matching type from a list of device type IDs */
function classifyDeviceTypes(deviceTypeIds: number[]): DeviceType {
  for (const id of deviceTypeIds) {
    const type = classifyDeviceType(id);
    if (type) return type;
  }
  return 'unknown';
}

/** Recursively collect all device endpoints (bridges expose children under the aggregator) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectAllEndpoints(topEndpoints: any[]): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const collect = (ep: any) => {
    all.push(ep);
    try {
      const children = ep.getChildEndpoints?.() ?? [];
      for (const child of children) collect(child);
    } catch { /* no children */ }
  };
  for (const ep of topEndpoints) collect(ep);
  return all;
}

/** Read color control cluster state from an endpoint */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readColorControlState(ep: any, state: Record<string, unknown>): void {
  try {
    const colorState = ep.state?.colorControl;
    if (colorState) {
      state.colorMode = colorState.colorMode;
      if (colorState.currentHue != null) {
        state.hue = Math.round((Number(colorState.currentHue) / 254) * 360);
      }
      if (colorState.currentSaturation != null) {
        state.saturation = Math.round((Number(colorState.currentSaturation) / 254) * 100);
      }
      if (colorState.colorTemperatureMireds != null) {
        state.colorTempMireds = Number(colorState.colorTemperatureMireds);
      }
    }
  } catch { /* cluster not present */ }
}

// ─── Controller ──────────────────────────────────────────────────────────────

export class MatterController {
  #controller?: CommissioningController;
  readonly #onStateChanged = new Set<DeviceCallback>();
  readonly #onDiscovered = new Set<DeviceCallback>();
  readonly #pairedNodes = new Map<string, PairedNode>();
  readonly #deviceCache = new Map<string, MatterDevice>();
  #started = false;

  async start(): Promise<void> {
    if (this.#started) return;
    this.#started = true;

    log.info('Matter controller starting...');

    // Configure environment with our data dir as storage
    const dataDir = getDataDir();
    const environment = Environment.default;
    environment.get(StorageService).location = dataDir;

    log.info(`Matter storage: ${dataDir}`);

    // Create the CommissioningController
    this.#controller = new CommissioningController({
      environment: {
        environment,
        id: 'brika-matter-controller',
      },
      autoConnect: false,
      adminFabricLabel: 'Brika Hub',
      basicInformation: {
        vendorName: 'Brika',
        productName: 'Matter Brika',
      },
    });

    await this.#controller.start();

    // Reconnect to any previously commissioned nodes
    const nodeIds = this.#controller.getCommissionedNodes();
    log.info(`Found ${nodeIds.length} commissioned node(s)`);

    for (const nodeId of nodeIds) {
      try {
        await this.#connectNode(nodeId);
      } catch (err) {
        log.warn(`Failed to connect to node ${nodeId}: ${err}`);
      }
    }

    log.info('Matter controller started');
  }

  async stop(): Promise<void> {
    if (!this.#started || !this.#controller) return;
    this.#started = false;

    await this.#controller.close();
    this.#pairedNodes.clear();
    this.#deviceCache.clear();
    log.info('Matter controller stopped');
  }

  // ─── Discovery ─────────────────────────────────────────────────────────────

  async discover(): Promise<MatterDevice[]> {
    if (!this.#controller) throw new Error('Controller not started');

    log.info('Scanning for commissionable Matter devices...');

    const discovered = await this.#controller.discoverCommissionableDevices(
      {}, // empty = discover all
      undefined,
      (device) => {
        log.info(
          `Discovered: ${device.deviceIdentifier ?? device.DN ?? 'unknown'} (discriminator: ${device.D})`,
        );
        const matterDevice: MatterDevice = {
          nodeId: `discovered-${device.D}`,
          name: device.DN ?? device.deviceIdentifier ?? `Device (${device.D})`,
          deviceType: 'unknown',
          online: true,
          commissioned: false,
          state: {},
          discriminator: device.D,
        };
        for (const cb of this.#onDiscovered) cb(matterDevice);
      },
      Seconds(10),
    );

    log.info(`Discovery complete: ${discovered.length} device(s) found`);

    return discovered.map((d) => ({
      nodeId: `discovered-${d.D}`,
      name: d.DN ?? d.deviceIdentifier ?? `Device (${d.D})`,
      deviceType: 'unknown' as const,
      online: true,
      commissioned: false,
      state: {},
      discriminator: d.D,
    }));
  }

  async commission(pairingCode: string): Promise<string> {
    if (!this.#controller) throw new Error('Controller not started');

    log.info(`Commissioning with pairing code: ${pairingCode}`);

    try {
      const commissioning = {
        regulatoryLocation: GeneralCommissioning.RegulatoryLocationType.IndoorOutdoor,
        regulatoryCountryCode: 'XX',
      };

      let options: NodeCommissioningOptions;

      if (pairingCode.startsWith('MT:')) {
        const [qrData] = QrPairingCodeCodec.decode(pairingCode);
        log.info(`Decoded QR code — discriminator: ${qrData.discriminator}, passcode: ${qrData.passcode}`);
        options = {
          commissioning,
          discovery: { identifierData: { longDiscriminator: qrData.discriminator } },
          passcode: qrData.passcode,
        };
      } else {
        const manualData = ManualPairingCodeCodec.decode(pairingCode);
        log.info(`Decoded manual code — discriminator: ${manualData.shortDiscriminator}, passcode: ${manualData.passcode}`);
        options = {
          commissioning,
          discovery: { identifierData: { shortDiscriminator: manualData.shortDiscriminator } },
          passcode: manualData.passcode,
        };
      }

      const nodeId = await this.#controller.commissionNode(options);
      log.info(`Commissioned node: ${nodeId}`);

      await this.#connectNode(nodeId);

      const device = this.#deviceCache.get(String(nodeId));
      if (device) {
        for (const cb of this.#onStateChanged) cb(device);
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
    if (!this.#controller) return false;

    // Resolve to the actual node ID (strip endpoint suffix for bridge children)
    const nodeId = deviceId.split(':')[0];
    const pairedNode = this.#pairedNodes.get(nodeId);
    if (!pairedNode) return false;

    try {
      await pairedNode.decommission();
    } catch (err) {
      log.warn(`Decommission error (removing anyway): ${err}`);
      await this.#controller.removeNode(NodeId(BigInt(nodeId)));
    }

    this.#pairedNodes.delete(nodeId);
    // Remove all cache entries for this node (including bridge children)
    for (const key of this.#deviceCache.keys()) {
      if (key === nodeId || key.startsWith(`${nodeId}:`)) {
        this.#deviceCache.delete(key);
      }
    }
    log.info(`Removed device: ${nodeId}`);
    return true;
  }

  // ─── Subscriptions ─────────────────────────────────────────────────────────

  onDeviceStateChanged(callback: DeviceCallback): () => void {
    this.#onStateChanged.add(callback);
    return () => this.#onStateChanged.delete(callback);
  }

  onDeviceDiscovered(callback: DeviceCallback): () => void {
    this.#onDiscovered.add(callback);
    return () => this.#onDiscovered.delete(callback);
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
    params?: Record<string, string>,
  ): Promise<boolean> {
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

      switch (command) {
        case 'on':
          await endpoint.commandsOf(OnOffClient).on();
          break;
        case 'off':
          await endpoint.commandsOf(OnOffClient).off();
          break;
        case 'toggle':
          await endpoint.commandsOf(OnOffClient).toggle();
          break;
        case 'setBrightness': {
          const level = Number(params?.level ?? 254);
          await endpoint.commandsOf(LevelControlClient).moveToLevel({
            level,
            transitionTime: 10, // 1 second
            optionsMask: { coupleColorTempToLevel: false, executeIfOff: true },
            optionsOverride: { coupleColorTempToLevel: false, executeIfOff: true },
          });
          break;
        }
        case 'setColorTemp': {
          const mireds = Number(params?.mireds ?? 370);
          // Access commands via generic endpoint.commands (ColorControlClient isn't barrel-exported)
          const colorCmds = (endpoint.commands as Record<string, Record<string, (args: unknown) => Promise<void>>>).colorControl;
          await colorCmds.moveToColorTemperature({
            colorTemperatureMireds: mireds,
            transitionTime: 5,
            optionsMask: { executeIfOff: true },
            optionsOverride: { executeIfOff: true },
          });
          break;
        }
        case 'setHueSaturation': {
          const hue = Number(params?.hue ?? 0);
          const saturation = Number(params?.saturation ?? 254);
          const hsCmds = (endpoint.commands as Record<string, Record<string, (args: unknown) => Promise<void>>>).colorControl;
          await hsCmds.moveToHueAndSaturation({
            hue,
            saturation,
            transitionTime: 5,
            optionsMask: { executeIfOff: true },
            optionsOverride: { executeIfOff: true },
          });
          break;
        }
        case 'lock':
          await endpoint.commandsOf(DoorLockClient).lockDoor({});
          break;
        case 'unlock':
          await endpoint.commandsOf(DoorLockClient).unlockDoor({});
          break;
        case 'coverOpen':
          await endpoint.commandsOf(WindowCoveringClient).upOrOpen();
          break;
        case 'coverClose':
          await endpoint.commandsOf(WindowCoveringClient).downOrClose();
          break;
        case 'coverStop':
          await endpoint.commandsOf(WindowCoveringClient).stopMotion();
          break;
        case 'setTargetTemp': {
          const amount = Number(params?.amount ?? 0);
          const mode = Number(params?.mode ?? 0); // 0 = heat, 1 = cool, 2 = both
          await endpoint.commandsOf(ThermostatClient).setpointRaiseLower({ amount, mode });
          break;
        }
      }

      // Refresh the device cache after command
      this.#refreshDeviceState(nodeIdPart, pairedNode);
      return true;
    } catch (err) {
      log.warn(`Command "${command}" failed on device ${deviceId}: ${err}`);
      return false;
    }
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  /** Notify all callbacks for devices belonging to a given node */
  #notifyNodeDevices(nodeIdStr: string): void {
    for (const device of this.#deviceCache.values()) {
      if (device.nodeId === nodeIdStr || device.nodeId.startsWith(`${nodeIdStr}:`)) {
        for (const cb of this.#onStateChanged) cb(device);
      }
    }
  }

  async #connectNode(nodeId: NodeId): Promise<void> {
    if (!this.#controller) return;

    const node = await this.#controller.getNode(nodeId);
    const nodeIdStr = String(nodeId);
    this.#pairedNodes.set(nodeIdStr, node);

    // Subscribe to attribute changes
    node.events.attributeChanged.on(({ path, value }) => {
      log.info(
        `Attribute changed on ${nodeIdStr}: ${path.endpointId}/${path.clusterId}/${path.attributeName} = ${value}`,
      );
      this.#refreshDeviceState(nodeIdStr, node);
      this.#notifyNodeDevices(nodeIdStr);
    });

    // Subscribe to endpoint structure changes (bridges add children after init)
    node.events.structureChanged.on(() => {
      const endpoints = node.getDevices();
      log.info(`Structure changed on ${nodeIdStr}: now ${endpoints.length} endpoint(s)`);
      this.#refreshDeviceState(nodeIdStr, node);
      this.#notifyNodeDevices(nodeIdStr);
    });

    // Subscribe to connection state changes
    node.events.stateChanged.on((state) => {
      const online = state === NodeStates.Connected;
      for (const device of this.#deviceCache.values()) {
        if (device.nodeId === nodeIdStr || device.nodeId.startsWith(`${nodeIdStr}:`)) {
          const wasOnline = device.online;
          device.online = online;
          if (wasOnline !== online) {
            for (const cb of this.#onStateChanged) cb(device);
          }
        }
      }
      if (online !== node.isConnected) {
        log.info(`Node ${nodeIdStr} ${online ? 'connected' : 'disconnected'}`);
      }
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
    this.#refreshDeviceState(nodeIdStr, node);
    log.info(`Connected to node ${nodeIdStr} (${node.getDevices().length} endpoint(s))`);
  }

  #refreshDeviceState(nodeIdStr: string, node: PairedNode): void {
    const info = node.basicInformation;
    const topEndpoints = node.getDevices();
    const allEndpoints = collectAllEndpoints(topEndpoints);

    log.info(`Node ${nodeIdStr}: ${topEndpoints.length} top-level, ${allEndpoints.length} total endpoint(s)`);

    // Remove stale entries for this node before rebuilding
    for (const key of this.#deviceCache.keys()) {
      if (key === nodeIdStr || key.startsWith(`${nodeIdStr}:`)) {
        this.#deviceCache.delete(key);
      }
    }

    if (allEndpoints.length === 0) {
      // No endpoints — store a placeholder
      this.#deviceCache.set(nodeIdStr, {
        nodeId: nodeIdStr,
        name: info?.productName ?? info?.nodeLabel ?? `Device ${nodeIdStr}`,
        deviceType: 'unknown',
        online: node.isConnected,
        commissioned: true,
        state: {},
      });
      return;
    }

    // Classify all endpoints to detect bridges vs actual devices
    const classified = allEndpoints.map((ep) => {
      const deviceTypes = ep.state?.descriptor?.deviceTypeList;
      let deviceType: DeviceType = 'unknown';
      if (deviceTypes?.length) {
        const ids = deviceTypes.map((dt: { deviceType: unknown }) => Number(dt.deviceType));
        for (const id of ids) {
          log.debug(`  ep${ep.number} device type: 0x${id.toString(16).padStart(4, '0')} (${id})`);
        }
        deviceType = classifyDeviceTypes(ids);
      }
      return { ep, deviceType };
    });

    // Always include all endpoints (bridges + device children)
    const hasMultiple = classified.length > 1;

    for (const { ep, deviceType } of classified) {
      const epNumber = ep.number;
      // Bridge gets root nodeId so children (nodeId:ep) can be matched by prefix
      const isChild = hasMultiple && deviceType !== 'bridge';
      const deviceId = isChild ? `${nodeIdStr}:${epNumber}` : nodeIdStr;

      // Read cluster states for this endpoint
      const state = this.#readEndpointState(ep);

      // Endpoint metadata: try bridged device info, fall back to node-level
      let epName: string | undefined;
      let vendor: string | undefined;
      let product: string | undefined;
      let serial: string | undefined;
      let softwareVersion: string | undefined;
      try {
        const bridgedInfo = ep.maybeStateOf(BridgedDeviceBasicInformationClient);
        if (bridgedInfo) {
          epName = bridgedInfo.nodeLabel ?? bridgedInfo.productName;
          vendor = bridgedInfo.vendorName;
          product = bridgedInfo.productName;
          serial = bridgedInfo.serialNumber;
          softwareVersion = bridgedInfo.softwareVersionString;
        }
      } catch { /* not a bridged endpoint */ }
      epName ??= hasMultiple ? `${info?.productName ?? 'Device'} #${epNumber}` : undefined;
      epName ??= info?.productName ?? info?.nodeLabel ?? `Device ${nodeIdStr}`;
      vendor ??= info?.vendorName;
      product ??= info?.productName;
      serial ??= info?.serialNumber;
      softwareVersion ??= info?.softwareVersionString;

      this.#deviceCache.set(deviceId, {
        nodeId: deviceId,
        name: epName,
        deviceType,
        online: node.isConnected,
        commissioned: true,
        state,
        vendor,
        product,
        serial,
        softwareVersion,
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #readEndpointState(ep: any): Record<string, unknown> {
    const state: Record<string, unknown> = {};

    try {
      const onOffState = ep.maybeStateOf(OnOffClient);
      if (onOffState) state.on = onOffState.onOff;
    } catch { /* cluster not present */ }

    try {
      const levelState = ep.maybeStateOf(LevelControlClient);
      if (levelState) {
        const level = levelState.currentLevel ?? 0;
        state.brightness = Math.round((Number(level) / 254) * 100);
      }
    } catch { /* cluster not present */ }

    readColorControlState(ep, state);

    try {
      const lockState = ep.maybeStateOf(DoorLockClient);
      if (lockState) {
        const ls = lockState.lockState;
        state.locked = ls === DoorLock.LockState.Locked;
        state.lockState = ls;
      }
    } catch { /* cluster not present */ }

    try {
      const coverState = ep.maybeStateOf(WindowCoveringClient);
      if (coverState) {
        state.coverPosition = coverState.currentPositionLiftPercentage ?? null;
        state.coverOperational = coverState.operationalStatus;
      }
    } catch { /* cluster not present */ }

    try {
      const thermoState = ep.maybeStateOf(ThermostatClient);
      if (thermoState) {
        const local = thermoState.localTemperature;
        state.temperature = local == null ? null : Number(local) / 100;
        state.systemMode = thermoState.systemMode;
        state.systemModeName = Thermostat.SystemMode[thermoState.systemMode] ?? 'unknown';
      }
    } catch { /* cluster not present */ }

    return state;
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let controller: MatterController | null = null;

export function getMatterController(): MatterController {
  controller ??= new MatterController();
  return controller;
}
