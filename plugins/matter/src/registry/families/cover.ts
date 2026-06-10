/**
 * Cover family: the windowCovering cluster.
 *
 * Lift percentage (state and `goToLiftPercentage`) is feature-gated in
 * matter.js, so those go through the string behavior-id surface.
 */

import { z } from '@brika/sdk/schema';
import { WindowCoveringClient } from '@matter/main/behaviors/window-covering';
import { clampPercent, commandArgs, type DeviceFamily, percentArg } from '../types';

export const cover: DeviceFamily = {
  id: 'cover',
  deviceTypeIds: {
    0x0202: 'cover', // Window Covering
  },
  clusters: [
    {
      id: 'windowCovering',
      read: (ep, state) => {
        const cs = ep.maybeStateOf('windowCovering');
        if (!cs) {
          return;
        }
        state.coverPosition = cs.currentPositionLiftPercentage ?? null;
        state.coverOperational = cs.operationalStatus;
      },
      classify: { type: 'cover', keys: ['coverPosition'], priority: 40 },
      commands: [
        {
          name: 'coverOpen',
          when: 'coverPosition',
          execute: (ep) => ep.commandsOf(WindowCoveringClient).upOrOpen(),
        },
        {
          name: 'coverClose',
          when: 'coverPosition',
          execute: (ep) => ep.commandsOf(WindowCoveringClient).downOrClose(),
        },
        {
          name: 'coverStop',
          when: 'coverPosition',
          execute: (ep) => ep.commandsOf(WindowCoveringClient).stopMotion(),
        },
        {
          name: 'setCoverPosition',
          when: 'coverPosition',
          // Human percent IS the raw Matter unit (lift percentage).
          args: commandArgs(
            z.object({ position: percentArg.default(0) }),
            '{ "position": "0-100" }',
            (parsed) => ({ position: String(Math.round(parsed.position)) })
          ),
          execute: (ep, args) =>
            ep.commandsOf('windowCovering').goToLiftPercentage({
              liftPercent100thsValue: Math.round(clampPercent(Number(args.position ?? 0)) * 100),
            }),
        },
      ],
    },
  ],
};
