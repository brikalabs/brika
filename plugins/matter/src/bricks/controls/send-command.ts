/**
 * Shared command hook for all device controls.
 * Returns a stable `sendCommand` callback that reads the plugin UID from context.
 */

import { useCallAction } from '@brika/sdk/ui-kit/hooks';
import { useCallback } from 'react';
import { doDeviceCommand } from '../../actions';

/** Send a command to a Matter device from client bricks */
export function useSendCommand() {
  const callAction = useCallAction();
  return useCallback(
    (nodeId: string, command: string, args?: Record<string, string>) => {
      callAction(doDeviceCommand, { nodeId, command, args });
    },
    [callAction],
  );
}
