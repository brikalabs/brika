/**
 * Matter Plugin Routes
 *
 * REST endpoints for device management, exposed at:
 * /api/plugins/:uid/routes/<path>
 *
 * Request bodies are zod-validated; the command vocabulary comes from
 * `MatterCommandSchema` (the registry's command SSOT), so an unknown command
 * never reaches the controller.
 */

import { defineRoute, type RouteResponse } from '@brika/sdk';
import { z } from '@brika/sdk/schema';
import { getMatterController } from './engine/controller';
import { MatterCommandSchema } from './registry';
import { serializeDevice } from './serialize';

function json(status: number, body: RouteResponse['body']): RouteResponse {
  return { status, body };
}

const CommissionBodySchema = z.object({ pairingCode: z.string().min(1) });

const CommandBodySchema = z.object({
  nodeId: z.string().min(1),
  command: z.string().min(1),
  params: z.record(z.string(), z.string()).optional(),
});

const RemoveBodySchema = z.object({ nodeId: z.string().min(1) });

// GET /devices: list all devices (commissioned + discovered cache)
defineRoute('GET', '/devices', () => {
  const controller = getMatterController();
  return json(200, {
    devices: controller.getDevices().map(serializeDevice),
    commissioned: controller.getCommissionedDevices().map(serializeDevice),
  });
});

// POST /scan: trigger network discovery (~10s blocking)
defineRoute('POST', '/scan', async () => {
  const controller = getMatterController();
  const discovered = await controller.discover();
  return json(200, { discovered: discovered.map(serializeDevice) });
});

// POST /commission: commission a device with pairing code
defineRoute('POST', '/commission', async (req) => {
  const body = CommissionBodySchema.safeParse(req.body ?? {});
  if (!body.success) {
    return json(400, { error: 'pairingCode is required' });
  }

  const controller = getMatterController();
  const nodeId = await controller.commission(body.data.pairingCode);

  if (nodeId) {
    const device = controller.getDevice(nodeId);
    return json(200, {
      nodeId,
      device: device ? serializeDevice(device) : null,
    });
  }
  return json(422, { error: 'Commission failed. Check the pairing code and try again.' });
});

// POST /command: send command to a device
defineRoute('POST', '/command', async (req) => {
  const body = CommandBodySchema.safeParse(req.body ?? {});
  if (!body.success) {
    return json(400, { error: 'nodeId and command are required' });
  }

  const command = MatterCommandSchema.safeParse(body.data.command);
  if (!command.success) {
    return json(422, { ok: false });
  }

  const controller = getMatterController();
  const ok = await controller.sendCommand(body.data.nodeId, command.data, body.data.params);
  return json(ok ? 200 : 422, { ok });
});

// POST /remove: decommission and remove a device
defineRoute('POST', '/remove', async (req) => {
  const body = RemoveBodySchema.safeParse(req.body ?? {});
  if (!body.success) {
    return json(400, { error: 'nodeId is required' });
  }

  const controller = getMatterController();
  const ok = await controller.removeDevice(body.data.nodeId);
  return json(ok ? 200 : 404, { ok });
});
