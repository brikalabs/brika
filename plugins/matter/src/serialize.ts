import type { MatterDevice } from './engine/device-model';

/** Convert a MatterDevice to a plain JSON-serializable object (full detail) */
export function serializeDevice(d: MatterDevice) {
  return {
    nodeId: d.nodeId,
    name: d.name,
    deviceType: d.deviceType,
    online: d.online,
    commissioned: d.commissioned,
    state: { ...d.state },
    commands: [...d.commands],
    parentId: d.parentId ?? null,
    button: d.button ?? null,
    discriminator: d.discriminator ?? null,
    vendor: d.vendor ?? null,
    product: d.product ?? null,
    serial: d.serial ?? null,
    softwareVersion: d.softwareVersion ?? null,
  };
}
