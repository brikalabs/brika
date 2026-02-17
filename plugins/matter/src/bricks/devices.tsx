import { Grid, Section, Stat, Status, defineBrick, useBrickSize, useEffect, useState } from '@brika/sdk/bricks';
import { type DeviceType, type MatterDevice, getMatterController } from '../matter-controller';

const DEVICE_ICONS: Record<DeviceType, string> = {
  light: 'lightbulb',
  lock: 'lock',
  cover: 'blinds',
  thermostat: 'thermometer',
  switch: 'toggle-right',
  sensor: 'eye',
  bridge: 'network',
  unknown: 'cpu',
};

const deviceIcon = (type: DeviceType) => DEVICE_ICONS[type] ?? 'cpu';

export const devicesBrick = defineBrick(
  {
    id: 'devices',
    name: 'Matter Devices',
    description: 'View Matter device status at a glance',
    icon: 'cpu',
    color: '#6366f1',
    families: ['sm', 'md', 'lg'],
    category: 'monitoring',
    minSize: { w: 2, h: 2 },
    maxSize: { w: 12, h: 8 },
    config: [],
  },
  () => {
    const { width, height } = useBrickSize();
    const [devices, setDevices] = useState<MatterDevice[]>([]);

    useEffect(() => {
      const controller = getMatterController();
      setDevices(controller.getDevices());

      const unsubState = controller.onDeviceStateChanged(() => {
        setDevices(controller.getDevices());
      });
      const unsubDiscovery = controller.onDeviceDiscovered(() => {
        setDevices(controller.getDevices());
      });

      return () => {
        unsubState();
        unsubDiscovery();
      };
    }, []);

    const commissioned = devices.filter((d) => d.commissioned);
    const online = commissioned.filter((d) => d.online);

    return (
      <>
        <Stat
          label="Devices"
          value={`${online.length} / ${commissioned.length}`}
          icon="cpu"
          color="#6366f1"
        />

        {height >= 3 && commissioned.length > 0 && (
          <Section title="Devices">
            <Grid columns={width >= 6 ? 3 : width >= 4 ? 2 : 1} gap="sm">
              {commissioned.map((d) => (
                <Status
                  label={d.name}
                  status={d.online ? 'online' : 'offline'}
                  icon={deviceIcon(d.deviceType)}
                />
              ))}
            </Grid>
          </Section>
        )}
      </>
    );
  },
);
