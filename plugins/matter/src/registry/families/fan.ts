/** Fan family: the fanControl cluster (fans and air purifiers). */

import { z } from '@brika/sdk/schema';
import { FanControlClient } from '@matter/main/behaviors/fan-control';
import { clampPercent, commandArgs, type DeviceFamily, percentArg } from '../types';

export const fan: DeviceFamily = {
  id: 'fan',
  deviceTypeIds: {
    0x002b: 'fan', // Fan
    0x002d: 'fan', // Air Purifier
  },
  clusters: [
    {
      id: 'fanControl',
      read: (ep, state) => {
        const cs = ep.maybeStateOf(FanControlClient);
        if (!cs) {
          return;
        }
        state.fanMode = Number(cs.fanMode);
        if (cs.percentSetting !== null && cs.percentSetting !== undefined) {
          state.fanSpeed = Number(cs.percentSetting);
        }
      },
      classify: { type: 'fan', keys: ['fanMode'], priority: 60 },
      commands: [
        {
          name: 'setFanMode',
          when: 'fanMode',
          // fanMode is a writable attribute, not a cluster command.
          execute: (ep, args) =>
            ep.setStateOf(FanControlClient, { fanMode: Number(args.mode ?? 0) }),
        },
        {
          name: 'setFanSpeed',
          when: 'fanMode',
          // Human percent IS the raw Matter unit (percentSetting).
          args: commandArgs(
            z.object({ speed: percentArg.default(0) }),
            '{ "speed": "0-100" }',
            (parsed) => ({ speed: String(Math.round(parsed.speed)) })
          ),
          execute: (ep, args) =>
            ep.setStateOf(FanControlClient, {
              percentSetting: Math.round(clampPercent(Number(args.speed ?? 0))),
            }),
        },
      ],
    },
  ],
};
