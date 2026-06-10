# Matter

Smart home device integration for BRIKA using the [Matter](https://csa-iot.org/all-solutions/matter/) protocol. Discover, commission, and control Matter devices on your local network: lights, locks, covers, thermostats, switches, sensors, fans, and robot vacuums.

## Architecture

```
src/
  index.tsx                 Plugin entry: lifecycle, spark wiring, brick data push
  engine/                   matter.js-facing core
    controller.ts           CommissioningController wrapper: lifecycle, node
                            subscriptions, notify channels, command dispatch
    device-model.ts         Endpoint tree -> flat device cache (classification,
                            state read, composed-device naming)
    press-tracker.ts        Raw switch events -> normalized gestures (short,
                            long, double, triple, multi)
  registry/                 Server-side device-family registry (zod allowed)
    types.ts                ClusterEntry/CommandSpec/DeviceFamily contracts,
                            MatterStateSchema, MATTER_COMMAND_VALUES (SSOT)
    index.ts                Composes ALL families: DEVICE_TYPE_MAP,
                            CLUSTER_ENTRIES, classification hints,
                            getClusterCommand (collisions throw at load)
    families/               One self-contained module per device family:
                            light, lock, cover, thermostat, switch, sensors,
                            fan, vacuum, bridge
  display/
    attributes.ts           Browser-safe, ZOD-FREE attribute registry: labels,
                            formatting, summaries (bricks and pages import it)
  blocks/                   Workflow blocks (+ config/node views)
  bricks/                   Client-rendered bricks (device, devices, commission)
    controls/               Per-family control panels + dispatcher (index.tsx)
  pages/                    Device management page
  tools.ts                  AI-discoverable tools (list/get/control device)
  actions.ts                Server actions for pages and client bricks
  routes.ts                 REST endpoints (zod-validated bodies)
  serialize.ts              MatterDevice -> JSON-safe shape
  sparks.ts                 Spark definitions
```

### Invariants

- **Endpoint-scoped notifications.** An attribute report names the endpoint
  that changed; only that bridged device's subscribers (plus the node root's)
  are notified. Fanning out to every device on a node turns one Hue bridge
  report into a workflow-trigger storm.
- **Composed devices.** A Hue dimmer/wall module names only its parent
  endpoint; button endpoints are named "Parent button N", carry `parentId` and
  `button`, and every press/event is re-emitted on the named parent so users
  can target the device they recognize.
- **Browser-safe display module.** `display/attributes.ts` must stay zod-free
  and free of server-only SDK imports: brick views and pages value-import it,
  and the `brika check` import boundary enforces it.
- **Press normalization.** Users think in gestures, not Matter event bursts.
  `engine/press-tracker.ts` collapses initialPress/shortRelease/longPress/
  multiPressComplete choreography into exactly one normalized press per
  gesture; blocks and bricks only ever see the normalized vocabulary.
- **State keys are schema-gated.** Cluster readers write raw slices that are
  filtered through `MatterStateSchema`; a key missing from the schema is
  silently dropped, and every schema key must have a display entry. The
  registry test (`src/registry/index.test.ts`) enforces both directions.

## Adding a new device family

Three touchpoints. Worked example: a hypothetical `airQuality` family that
reads PM2.5 and CO2 and can set a target air-quality mode.

### 1. `src/registry/families/air-quality.ts` (required)

Create the family module: device-type ids, cluster readers, commands. Add any
new command names to `MATTER_COMMAND_VALUES` and any new state keys to
`MatterStateSchema` (both in `src/registry/types.ts`).

```ts
import type { DeviceFamily } from '../types';

export const airQuality: DeviceFamily = {
  id: 'airQuality',
  deviceTypeIds: {
    0x002c: 'sensor', // Air Quality Sensor (or a new DeviceType)
  },
  clusters: [
    {
      id: 'pm25ConcentrationMeasurement',
      read: (ep, state) => {
        const value = ep.maybeStateOf('pm25ConcentrationMeasurement')?.measuredValue;
        if (value !== null && value !== undefined) {
          state.pm25 = Number(value); // add `pm25` to MatterStateSchema!
        }
      },
      // Lower priority number = checked first; sensors use 80 (see
      // ClassificationHint in registry/types.ts for the bands in use).
      classify: { type: 'sensor', keys: ['pm25'], priority: 80 },
      commands: [
        {
          name: 'setAirQualityMode', // add to MATTER_COMMAND_VALUES first
          when: 'pm25',
          execute: (ep, args) =>
            ep.setStateOf('pm25ConcentrationMeasurement', { mode: Number(args.mode ?? 0) }),
        },
      ],
    },
  ],
};
```

Then register it in `src/registry/index.ts`: import the module and append it
to `FAMILIES`. That is the only edit there; the registry derives
`DEVICE_TYPE_MAP`, `CLUSTER_ENTRIES`, classification, and the command lookup,
and throws at module load if your family collides with an existing device-type
id or command name.

### 2. `src/display/attributes.ts` + locales (required for new state keys)

Give each new state key its human face, and label it in BOTH locales:

```ts
// ATTRIBUTES entry (keep the module zod-free):
{
  key: 'pm25',
  kind: 'number',
  labelKey: 'device.attributes.pm25',
  format: (value) => `${String(value)} ug/m3`,
  category: 'sensor',
  watchable: true,
  summaryPriority: 15,
},
```

Add `device.attributes.pm25` to `locales/en/plugin.json` and
`locales/fr/plugin.json`. If the family introduces a new `DeviceType`, extend
`DEVICE_TYPE_VALUES` and `SUMMARY_RULES` here too (plus `device.types.*` keys).

### 3. `src/bricks/controls/` panel (optional)

Sensors render automatically through `SensorControls`. Only add a dedicated
panel when the family needs custom interaction: create
`src/bricks/controls/air-quality.tsx` and add a `case` for the device type in
the `DeviceControls` dispatcher (`src/bricks/controls/index.tsx`). Brick views
are browser-rendered: import from `display/attributes.ts` only, never from
`registry/` or `engine/`.

### Verify

`bun test plugins/matter/` runs the registry guardrails (duplicate ids,
duplicate commands, executor coverage, attribute coverage), then
`bun node_modules/.bin/brika build && bun node_modules/.bin/brika check`
regenerates the manifest and enforces the import boundaries.

## Device Management Page

Full device management UI accessible from the plugin page:

- **Network scanning** to discover commissionable devices nearby
- **Commission** devices using an 11-digit pairing code or QR code string
- **Device list** organized by type with online/offline indicators
- **Bridge support**: automatically detects bridges and lists their child devices
- **Device info** dialog with vendor, product, serial number, software version, and more
- **Remove** devices to decommission them from BRIKA

## Bricks

### Devices Overview

At-a-glance monitoring of all your commissioned devices.

- **Sizes:** 2×2 to 12×8
- **Displays:** Online/total device count, device grid with status indicators
- **Layouts:** 1-3 columns depending on brick width

### Device Control

Individual device control that adapts to the device type:

- **Lights**: Toggle, brightness slider, hue/saturation, color temperature with color preview
- **Locks**: Lock/unlock toggle with visual feedback
- **Covers**: Open, stop, close buttons with position percentage
- **Thermostats**: Current temperature and system mode
- **Switches**: Power toggle (battery remotes show a live last-press panel instead)
- **Vacuums**: Start, pause, resume, dock with operational state
- **Sensors**: Up to 2 sensor values displayed
- **Sizes:** 1×1 to 6×6
- **Config:** Select which device to display from a dropdown

### Add a Matter Device

Pair a new device from a dashboard with its setup code.

## Sparks

### Device State Changed

Emitted when any Matter device changes state.

| Field        | Type    | Description                                    |
|--------------|---------|------------------------------------------------|
| `nodeId`     | string  | Device node identifier                         |
| `name`       | string  | Device name                                    |
| `deviceType` | string  | Type (light, lock, cover, thermostat, etc.)    |
| `online`     | boolean | Whether the device is reachable                |
| `state`      | object  | Full device state (power, brightness, temp...) |

### Device Discovered

Emitted when a new Matter device is found on the network.

| Field        | Type   | Description                                 |
|--------------|--------|---------------------------------------------|
| `nodeId`     | string | Device node identifier                      |
| `name`       | string | Device name                                 |
| `deviceType` | string | Type (light, lock, cover, thermostat, etc.) |

Also emitted: `device-online`, `device-offline` (connection transitions) and
`attribute-changed` (one spark per changed attribute).

## Blocks

### Matter Command

Send commands to Matter devices from automation workflows.

**Inputs:**
- `trigger` (generic): activates the command

**Outputs:**
- `success`: emits `{ nodeId, command }` on success
- `error`: emits `{ message }` on failure

**Config:**
- `nodeId` (string): target device
- `command` (enum): one of `MATTER_COMMAND_VALUES` (on, off, toggle, setBrightness, setColorTemp, setHueSaturation, lock, unlock, coverOpen, coverClose, coverStop, setCoverPosition, setTargetTemp, setFanMode, setFanSpeed, vacuumStart, vacuumPause, vacuumResume, vacuumDock)
- `params` (object, optional): command-specific parameters (e.g. brightness level, target temperature)

### When Device Changes

Trigger block: fires when a device's attributes change (any change, becomes a
value, or crosses a threshold) or when it emits a Matter event (button press).

### When Button Pressed

Trigger block: fires once per normalized button gesture (short, long, double,
triple, multi) on a Matter switch or remote.

## Tools

AI-discoverable hub-wide tools: `list-devices`, `get-device-state`, and
`control-device` (single or batched nodeIds, human-unit arguments validated by
the registry's command contracts).

## Preferences

| Preference       | Type     | Default | Description                                 |
|------------------|----------|---------|---------------------------------------------|
| Auto-commission  | checkbox | off     | Automatically commission discovered devices |

## Supported Devices

Lights, dimmable lights, color lights, color temperature lights, plugs, outlets, switches and battery remotes, door locks, window covers, thermostats, fans, air purifiers, robot vacuums, temperature sensors, humidity sensors, contact sensors, occupancy sensors, light sensors, and bridges.

## Localization

Fully translated in English and French.
