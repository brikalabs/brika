/**
 * Input-forwarding mode. Reuses the main layout (service list + log
 * pane) so the user can see the child's output while typing; the
 * footer switches to an INPUT banner. Every key except Esc is
 * translated and written to the focused service's stdin.
 *
 * Receives the target `serviceId` as a route param so we can write
 * to the right pipe even if the user tab-switches in the future
 * (currently disabled while in input mode — the focus is locked).
 */

import { useInput } from 'ink';
import type React from 'react';
import { useRouter } from '../../router';
import { MainLayout } from '../components/MainLayout';
import { keyToBytes } from '../keys/keyToBytes';
import type { Routes } from '../routes';
import { useMortar } from '../useMortar';

export interface InputViewProps {
  readonly serviceId: string;
}

export function InputView({ serviceId }: Readonly<InputViewProps>): React.ReactElement {
  const { supervisor, toast } = useMortar();
  const router = useRouter<Routes>();

  useInput((input, key) => {
    if (key.escape) {
      router.back();
      toast.showToast('Input mode exited');
      return;
    }
    const bytes = keyToBytes(input, key);
    if (bytes !== null) {
      supervisor.writeStdin(serviceId, bytes);
    }
  });

  return <MainLayout inputModeFor={serviceId} />;
}
