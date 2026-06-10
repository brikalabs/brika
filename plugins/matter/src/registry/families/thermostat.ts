/** Thermostat family: the thermostat cluster. */

import { ThermostatClient } from '@matter/main/behaviors/thermostat';
import { Thermostat } from '@matter/main/clusters';
import type { DeviceFamily } from '../types';

export const thermostat: DeviceFamily = {
  id: 'thermostat',
  deviceTypeIds: {
    0x0301: 'thermostat', // Thermostat
  },
  clusters: [
    {
      id: 'thermostat',
      read: (ep, state) => {
        const cs = ep.maybeStateOf(ThermostatClient);
        if (!cs) {
          return;
        }
        const local = cs.localTemperature;
        state.temperature = local === null ? null : Number(local) / 100;
        state.systemMode = cs.systemMode;
        state.systemModeName = Thermostat.SystemMode[cs.systemMode] ?? 'unknown';
      },
      classify: { type: 'thermostat', keys: ['systemMode'], priority: 50 },
      commands: [
        {
          name: 'setTargetTemp',
          when: 'systemMode',
          execute: (ep, args) =>
            ep.commandsOf(ThermostatClient).setpointRaiseLower({
              amount: Number(args.amount ?? 0),
              mode: Number(args.mode ?? 0), // 0 = heat, 1 = cool, 2 = both
            }),
        },
      ],
    },
  ],
};
