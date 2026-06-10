/** Vacuum family: the RVC run-mode and operational-state clusters. */

import { RvcOperationalStateClient } from '@matter/main/behaviors/rvc-operational-state';
import { RvcRunModeClient } from '@matter/main/behaviors/rvc-run-mode';
import { RvcRunMode } from '@matter/main/clusters';
import type { DeviceFamily, MatterEndpoint } from '../types';

/** Find the run mode tagged Cleaning so `vacuumStart` works without a mode arg. */
function resolveCleaningMode(ep: MatterEndpoint, modeArg: string | undefined): number {
  if (modeArg !== undefined) {
    return Number(modeArg);
  }
  const supported = ep.maybeStateOf(RvcRunModeClient)?.supportedModes ?? [];
  for (const mode of supported) {
    const isCleaning = mode.modeTags.some(
      (tag) => Number(tag.value) === RvcRunMode.ModeTag.Cleaning
    );
    if (isCleaning) {
      return Number(mode.mode);
    }
  }
  return 1;
}

export const vacuum: DeviceFamily = {
  id: 'vacuum',
  deviceTypeIds: {
    0x0074: 'vacuum', // Robotic Vacuum Cleaner
  },
  clusters: [
    {
      id: 'rvcRunMode',
      commands: [
        {
          name: 'vacuumStart',
          when: 'vacuumState',
          execute: (ep, args) =>
            ep.commandsOf(RvcRunModeClient).changeToMode({
              newMode: resolveCleaningMode(ep, args.mode),
            }),
        },
      ],
    },
    {
      id: 'rvcOperationalState',
      read: (ep, state) => {
        const cs = ep.maybeStateOf(RvcOperationalStateClient);
        if (!cs) {
          return;
        }
        const op = cs.operationalState;
        if (op !== null && op !== undefined) {
          state.vacuumState = Number(op);
        }
      },
      classify: { type: 'vacuum', keys: ['vacuumState'], priority: 70 },
      commands: [
        {
          name: 'vacuumPause',
          when: 'vacuumState',
          execute: (ep) => ep.commandsOf(RvcOperationalStateClient).pause(),
        },
        {
          name: 'vacuumResume',
          when: 'vacuumState',
          execute: (ep) => ep.commandsOf(RvcOperationalStateClient).resume(),
        },
        {
          name: 'vacuumDock',
          when: 'vacuumState',
          execute: (ep) => ep.commandsOf(RvcOperationalStateClient).goHome(),
        },
      ],
    },
  ],
};
