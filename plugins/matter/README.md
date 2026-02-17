# Matter

Smart home device integration for BRIKA using the [Matter](https://csa-iot.org/all-solutions/matter/) protocol. Discover, commission, and control Matter devices on your local network — lights, locks, covers, thermostats, switches, and sensors.

## Device Management Page

Full device management UI accessible from the plugin page:

- **Network scanning** to discover commissionable devices nearby
- **Commission** devices using an 11-digit pairing code or QR code string
- **Device list** organized by type with online/offline indicators
- **Bridge support** — automatically detects bridges and lists their child devices
- **Device info** dialog with vendor, product, serial number, software version, and more
- **Remove** devices to decommission them from BRIKA

## Bricks

### Devices Overview

At-a-glance monitoring of all your commissioned devices.

- **Sizes:** 2×2 to 12×8
- **Displays:** Online/total device count, device grid with status indicators
- **Layouts:** 1–3 columns depending on brick width

### Device Control

Individual device control that adapts to the device type:

- **Lights** — Toggle, brightness slider, hue/saturation, color temperature with color preview
- **Locks** — Lock/unlock toggle with visual feedback
- **Covers** — Open, stop, close buttons with position percentage
- **Thermostats** — Current temperature and system mode
- **Switches** — Power toggle
- **Sensors** — Up to 2 sensor values displayed
- **Sizes:** 1×1 to 6×6
- **Config:** Select which device to display from a dropdown

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

## Blocks

### Command

Send commands to Matter devices from automation workflows.

**Inputs:**
- `trigger` (generic) — Activates the command

**Outputs:**
- `success` — Emits `{ nodeId, command }` on success
- `error` — Emits `{ error }` on failure

**Config:**
- `nodeId` (string) — Target device
- `command` (string) — One of: `on`, `off`, `toggle`, `setBrightness`, `setColorTemp`, `setHueSaturation`, `lock`, `unlock`, `coverOpen`, `coverClose`, `coverStop`, `setTargetTemp`
- `params` (object, optional) — Command-specific parameters (e.g. brightness level, target temperature)

## Preferences

| Preference       | Type     | Default | Description                                 |
|------------------|----------|---------|---------------------------------------------|
| Auto-commission  | checkbox | off     | Automatically commission discovered devices |

## Supported Devices

Lights, dimmable lights, color lights, color temperature lights, plugs, outlets, switches, door locks, window covers, thermostats, temperature sensors, humidity sensors, contact sensors, occupancy sensors, and bridges.

## Localization

Fully translated in English and French.
