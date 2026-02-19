import {
  Box,
  Button,
  defineBrick,
  Row,
  Slider,
  Stat,
  Status,
  Toggle,
  useBrickSize,
  useEffect,
  usePreference,
  useState,
} from '@brika/sdk/bricks';
import { type DeviceType, getMatterController, type MatterDevice } from '../matter-controller';

// ─── Icon / color per device type ───────────────────────────────────────────

const DEVICE_META: Record<DeviceType, { icon: string; color: string; label: string }> = {
  light:      { icon: 'lightbulb',    color: '#f59e0b', label: 'Light' },
  lock:       { icon: 'lock',         color: '#6366f1', label: 'Lock' },
  cover:      { icon: 'blinds',       color: '#0ea5e9', label: 'Cover' },
  thermostat: { icon: 'thermometer',  color: '#ef4444', label: 'Thermostat' },
  switch:     { icon: 'toggle-right', color: '#22c55e', label: 'Switch' },
  sensor:     { icon: 'eye',          color: '#8b5cf6', label: 'Sensor' },
  bridge:     { icon: 'network',      color: '#64748b', label: 'Bridge' },
  unknown:    { icon: 'cpu',          color: '#64748b', label: 'Device' },
};

function meta(type: DeviceType) {
  return DEVICE_META[type] ?? DEVICE_META.unknown;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert HSV (h 0-360, s 0-100, v 0-100) → CSS hex color */
function hsvToHex(h: number, s: number, v: number): string {
  const sn = s / 100;
  const vn = v / 100;
  const c = vn * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = vn - c;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else              { r = c; b = x; }
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Convert color temperature in mireds → approximate CSS hex color */
function miredsToHex(mireds: number): string {
  // Kelvin = 1,000,000 / mireds. Map warm (500 mireds / 2000K) → cool (153 mireds / 6500K)
  const kelvin = Math.round(1_000_000 / Math.max(mireds, 100));
  // Simplified Kelvin → RGB (Tanner Helland algorithm)
  const t = kelvin / 100;
  let r: number, g: number, b: number;
  if (t <= 66) {
    r = 255;
    g = Math.min(255, Math.max(0, 99.47 * Math.log(t) - 161.12));
    b = t <= 19 ? 0 : Math.min(255, Math.max(0, 138.52 * Math.log(t - 10) - 305.04));
  } else {
    r = Math.min(255, Math.max(0, 329.7 * ((t - 60) ** -0.1332)));
    g = Math.min(255, Math.max(0, 288.12 * ((t - 60) ** -0.0755)));
    b = 255;
  }
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ─── Device-type specific controls ──────────────────────────────────────────

function LightControls({ device, height }: Readonly<{ device: MatterDevice; height: number }>) {
  const isOn = Boolean(device.state.on);
  const brightness = device.state.brightness == null ? null : Number(device.state.brightness);
  const hue = device.state.hue == null ? null : Number(device.state.hue);
  const saturation = device.state.saturation == null ? null : Number(device.state.saturation);
  const colorTempMireds = device.state.colorTempMireds == null ? null : Number(device.state.colorTempMireds);
  const hasColor = hue != null && saturation != null;
  const hasColorTemp = colorTempMireds != null;

  // Compute a preview color from current state
  let previewColor = '#f59e0b';
  if (hasColor) previewColor = hsvToHex(hue, saturation, brightness ?? 100);
  else if (hasColorTemp) previewColor = miredsToHex(colorTempMireds);

  const handleToggle = () => {
    getMatterController().sendCommand(device.nodeId, 'toggle');
  };

  const handleBrightness = (payload?: Record<string, unknown>) => {
    const value = Number(payload?.value ?? 100);
    const level = Math.round((value / 100) * 254);
    getMatterController().sendCommand(device.nodeId, 'setBrightness', { level: String(level) });
  };

  const handleHue = (payload?: Record<string, unknown>) => {
    const deg = Number(payload?.value ?? 0);
    // degrees 0-360 → Matter hue 0-254
    const matterHue = Math.round((deg / 360) * 254);
    const matterSat = saturation == null ? 254 : Math.round((saturation / 100) * 254);
    getMatterController().sendCommand(device.nodeId, 'setHueSaturation', {
      hue: String(matterHue),
      saturation: String(matterSat),
    });
  };

  const handleSaturation = (payload?: Record<string, unknown>) => {
    const pct = Number(payload?.value ?? 100);
    const matterHue = hue == null ? 0 : Math.round((hue / 360) * 254);
    const matterSat = Math.round((pct / 100) * 254);
    getMatterController().sendCommand(device.nodeId, 'setHueSaturation', {
      hue: String(matterHue),
      saturation: String(matterSat),
    });
  };

  const handleColorTemp = (payload?: Record<string, unknown>) => {
    const mireds = Number(payload?.value ?? 370);
    getMatterController().sendCommand(device.nodeId, 'setColorTemp', { mireds: String(mireds) });
  };

  return (
    <>
      <Row>
        <Toggle label="Power" checked={isOn} onToggle={handleToggle} icon="power" color={previewColor} />
        <Box background={previewColor} rounded="full" width="24px" height="24px" />
      </Row>
      {height >= 3 && brightness != null && (
        <Slider
          label="Brightness"
          value={brightness}
          min={0}
          max={100}
          step={5}
          unit="%"
          onChange={handleBrightness}
          icon="sun"
          color={previewColor}
        />
      )}
      {height >= 4 && hasColor && (
        <Slider
          label="Hue"
          value={hue}
          min={0}
          max={360}
          step={5}
          unit="°"
          onChange={handleHue}
          icon="palette"
          color={hsvToHex(hue, 100, 100)}
        />
      )}
      {height >= 4 && hasColor && (
        <Slider
          label="Saturation"
          value={saturation}
          min={0}
          max={100}
          step={5}
          unit="%"
          onChange={handleSaturation}
          icon="droplets"
          color={previewColor}
        />
      )}
      {height >= 3 && hasColorTemp && !hasColor && (
        <Slider
          label="Temperature"
          value={colorTempMireds}
          min={153}
          max={500}
          step={10}
          onChange={handleColorTemp}
          icon="thermometer"
          color={miredsToHex(colorTempMireds)}
        />
      )}
    </>
  );
}

function LockControls({ device }: Readonly<{ device: MatterDevice }>) {
  const isLocked = Boolean(device.state.locked);

  const handleToggle = () => {
    getMatterController().sendCommand(device.nodeId, isLocked ? 'unlock' : 'lock');
  };

  return (
    <Toggle
      label={isLocked ? 'Locked' : 'Unlocked'}
      checked={isLocked}
      onToggle={handleToggle}
      icon={isLocked ? 'lock' : 'lock-open'}
      color={isLocked ? '#22c55e' : '#ef4444'}
    />
  );
}

function CoverControls({ device }: Readonly<{ device: MatterDevice }>) {
  const position = Number(device.state.coverPosition);

  const handleOpen = () => getMatterController().sendCommand(device.nodeId, 'coverOpen');
  const handleClose = () => getMatterController().sendCommand(device.nodeId, 'coverClose');
  const handleStop = () => getMatterController().sendCommand(device.nodeId, 'coverStop');

  return (
    <>
      {position != null && (
        <Stat label="Position" value={`${position}%`} icon="blinds" color="#0ea5e9" />
      )}
      <Row>
        <Button label="Open" icon="chevron-up" onPress={handleOpen} variant="outline" size="sm" />
        <Button label="Stop" icon="square" onPress={handleStop} variant="outline" size="sm" />
        <Button label="Close" icon="chevron-down" onPress={handleClose} variant="outline" size="sm" />
      </Row>
    </>
  );
}

function ThermostatControls({ device }: Readonly<{ device: MatterDevice }>) {
  const temp = device.state.temperature;
  const modeName = device.state.systemModeName;

  return (
    <>
      {temp != null && (
        <Stat label="Temperature" value={`${Number(temp)}`} unit="°C" icon="thermometer" color="#ef4444" />
      )}
      {typeof modeName === 'string' && (
        <Stat label="Mode" value={modeName} icon="gauge" />
      )}
    </>
  );
}

function SwitchControls({ device }: Readonly<{ device: MatterDevice }>) {
  const isOn = Boolean(device.state.on);

  const handleToggle = () => {
    getMatterController().sendCommand(device.nodeId, 'toggle');
  };

  return <Toggle label="Power" checked={isOn} onToggle={handleToggle} icon="power" />;
}

function SensorControls({ device }: Readonly<{ device: MatterDevice }>) {
  const entries = Object.entries(device.state);
  if (entries.length === 0) {
    return <Stat label="Sensor" value="No data" icon="eye" />;
  }
  // Show first two sensor values
  return (
    <>
      {entries.slice(0, 2).map(([sensorKey, value]) => (
        <Stat label={sensorKey} value={String(value)} icon="activity" />
      ))}
    </>
  );
}

function DeviceControls({ device, height }: Readonly<{ device: MatterDevice; height: number }>) {
  switch (device.deviceType) {
    case 'light':      return <LightControls device={device} height={height} />;
    case 'lock':       return <LockControls device={device} />;
    case 'cover':      return <CoverControls device={device} />;
    case 'thermostat': return <ThermostatControls device={device} />;
    case 'switch':     return <SwitchControls device={device} />;
    case 'sensor':     return <SensorControls device={device} />;
    default:           return <Stat label={meta(device.deviceType).label} value={device.name} icon={meta(device.deviceType).icon} />;
  }
}

// ─── Brick definition ───────────────────────────────────────────────────────

export const deviceBrick = defineBrick(
  {
    id: 'device',
    name: 'Matter Device',
    description: 'Control any Matter device — adapts to lights, locks, covers, thermostats and more',
    icon: 'cpu',
    color: '#6366f1',
    families: ['sm', 'md'],
    category: 'control',
    minSize: { w: 1, h: 1 },
    maxSize: { w: 6, h: 6 },
    config: [
      {
        type: 'dynamic-dropdown',
        name: 'deviceId',
        label: 'Device',
        description: 'Select a commissioned Matter device',
      },
    ],
  },
  () => {
    const { height } = useBrickSize();
    const [deviceId] = usePreference<string>('deviceId', '');
    const [device, setDevice] = useState<MatterDevice | null>(null);

    useEffect(() => {
      if (!deviceId) {
        setDevice(null);
        return;
      }

      const controller = getMatterController();
      const dev = controller.getDevice(deviceId);
      if (dev) setDevice(dev);

      const unsub = controller.onDeviceStateChanged((updated) => {
        if (updated.nodeId === deviceId) setDevice(updated);
      });

      return unsub;
    }, [deviceId]);

    if (!deviceId) {
      return <Stat label="Matter Device" value="No device" icon="cpu" />;
    }

    if (!device) {
      return <Stat label="Matter Device" value="Not found" icon="cpu" />;
    }

    const { icon, color } = meta(device.deviceType);

    return (
      <>
        <Status
          label={device.name}
          status={device.online ? 'online' : 'offline'}
          icon={icon}
          color={color}
        />
        <DeviceControls device={device} height={height} />
      </>
    );
  },
);
