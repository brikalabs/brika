/**
 * Switch family: the switch cluster (physical buttons) plus powerSource
 * (battery remotes report their charge through it).
 *
 * Classification priority 10 leads every other hint on purpose: wall switch
 * modules expose both Switch and OnOff clusters, and Hue dimmer button
 * endpoints must never classify as lights.
 */

import { SwitchClient } from '@matter/main/behaviors/switch';
import type { DeviceFamily } from '../types';

export const switchFamily: DeviceFamily = {
  id: 'switch',
  deviceTypeIds: {
    0x0103: 'switch', // On/Off Light Switch
    0x0104: 'switch', // Dimmer Switch
    0x0105: 'switch', // Color Dimmer Switch
    0x000f: 'switch', // Generic Switch
  },
  clusters: [
    {
      id: 'switch',
      read: (ep, state) => {
        const cs = ep.maybeStateOf(SwitchClient);
        if (!cs) {
          return;
        }
        state.buttonPosition = Number(cs.currentPosition ?? 0);
        state.buttons = Number(cs.numberOfPositions ?? 2);
      },
      classify: { type: 'switch', keys: ['buttonPosition'], priority: 10 },
    },
    {
      id: 'powerSource',
      // batPercentRemaining is feature-gated (BAT), so read through the string surface.
      read: (ep, state) => {
        const battery = ep.maybeStateOf('powerSource')?.batPercentRemaining;
        if (battery !== null && battery !== undefined) {
          // Matter reports battery in half-percent units.
          state.battery = Math.round(Number(battery) / 2);
        }
      },
    },
  ],
};
