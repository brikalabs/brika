/**
 * Matter Plugin Routes
 *
 * REST endpoints for device management, exposed at:
 * /api/plugins/:uid/routes/<path>
 */

import { defineRoute, type RouteResponse } from '@brika/sdk';
import { type MatterCommand, getMatterController } from './matter-controller';
import { serializeDevice } from './serialize';

function json(status: number, body: unknown): RouteResponse {
  return { status, body: body as RouteResponse['body'] };
}

// GET /devices — list all devices (commissioned + discovered cache)
defineRoute('GET', '/devices', () => {
  const controller = getMatterController();
  return json(200, {
    devices: controller.getDevices().map(serializeDevice),
    commissioned: controller.getCommissionedDevices().map(serializeDevice),
  });
});

// POST /scan — trigger network discovery (~10s blocking)
defineRoute('POST', '/scan', async () => {
  const controller = getMatterController();
  const discovered = await controller.discover();
  return json(200, { discovered: discovered.map(serializeDevice) });
});

// POST /commission — commission a device with pairing code
defineRoute('POST', '/commission', async (req) => {
  const { pairingCode } = (req.body ?? {}) as { pairingCode?: string };
  if (!pairingCode || typeof pairingCode !== 'string') {
    return json(400, { error: 'pairingCode is required' });
  }

  const controller = getMatterController();
  const nodeId = await controller.commission(pairingCode);

  if (nodeId) {
    const device = controller.getDevice(nodeId);
    return json(200, {
      nodeId,
      device: device ? serializeDevice(device) : null,
    });
  }
  return json(422, { error: 'Commission failed. Check the pairing code and try again.' });
});

// POST /command — send command to a device
defineRoute('POST', '/command', async (req) => {
  const { nodeId, command, params } = (req.body ?? {}) as {
    nodeId?: string;
    command?: string;
    params?: Record<string, string>;
  };

  if (!nodeId || !command) {
    return json(400, { error: 'nodeId and command are required' });
  }

  const controller = getMatterController();
  const ok = await controller.sendCommand(nodeId, command as MatterCommand, params);
  return json(ok ? 200 : 422, { ok });
});

// POST /remove — decommission and remove a device
defineRoute('POST', '/remove', async (req) => {
  const { nodeId } = (req.body ?? {}) as { nodeId?: string };
  if (!nodeId) {
    return json(400, { error: 'nodeId is required' });
  }

  const controller = getMatterController();
  const ok = await controller.removeDevice(nodeId);
  return json(ok ? 200 : 404, { ok });
});
