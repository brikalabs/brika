/** Lock family: the doorLock cluster. */

import { DoorLockClient } from '@matter/main/behaviors/door-lock';
import { DoorLock } from '@matter/main/clusters';
import type { DeviceFamily } from '../types';

export const lock: DeviceFamily = {
  id: 'lock',
  deviceTypeIds: {
    0x000a: 'lock', // Door Lock
    0x000b: 'lock', // Door Lock Controller
  },
  clusters: [
    {
      id: 'doorLock',
      read: (ep, state) => {
        const cs = ep.maybeStateOf(DoorLockClient);
        if (!cs) {
          return;
        }
        const ls = cs.lockState;
        state.locked = ls === DoorLock.LockState.Locked;
        state.lockState = ls;
      },
      classify: { type: 'lock', keys: ['locked'], priority: 30 },
      commands: [
        {
          name: 'lock',
          when: 'locked',
          execute: (ep) => ep.commandsOf(DoorLockClient).lockDoor({}),
        },
        {
          name: 'unlock',
          when: 'locked',
          execute: (ep) => ep.commandsOf(DoorLockClient).unlockDoor({}),
        },
      ],
    },
  ],
};
