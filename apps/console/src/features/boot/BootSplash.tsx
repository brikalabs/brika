/**
 * Boot splash layout — the actual rendered surface. Sits inside an
 * `<EmoteProvider>` (mounted by the outer `<BootScreen>` entry) so it
 * can drive Brix's greeting animation while the fake-step list ticks.
 *
 *     ██████╗ ██████╗ ██╗██╗  ██╗ █████╗
 *     ██████╔╝██████╔╝██║█████╔╝ ███████║
 *     ╚═════╝ ╚═╝  ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝
 *           BrikaOS · v<version>
 *
 *               ╭───╮
 *               │^◡^│
 *               ╰───╯
 *
 *           ✓  bribing the kernel
 *           ✓  reticulating splines
 *           ⠙  consulting the rubber duck…
 *
 *         © 2026 Brika Labs
 */

import { BrixStage, useEmote } from '@brika/brix';
import { useTerminalSize } from '@brika/tui';
import { Box, useInput } from 'ink';
import type React from 'react';
import { useEffect } from 'react';
import { BrandLogo, BrandTagline } from './Brand';
import { ReadyLine } from './ReadyLine';
import { StepList } from './StepList';
import { useBootSequence } from './useBootSequence';

export interface BootSplashProps {
  readonly version: string;
  readonly onComplete: () => void;
}

export function BootSplash({ version, onComplete }: Readonly<BootSplashProps>): React.ReactElement {
  const { columns, rows } = useTerminalSize();
  const api = useEmote();
  const { steps, greeting, currentIdx, phase } = useBootSequence(onComplete);

  useEffect(() => {
    api.play(greeting);
  }, [api, greeting]);

  // Any key press skips the splash early.
  useInput(() => onComplete());

  return (
    <Box width={columns} height={Math.max(3, rows - 1)} alignItems="center" justifyContent="center">
      <Box flexDirection="column" alignItems="center">
        <BrandLogo />
        <BrandTagline version={version} />
        <Box marginTop={1}>
          <BrixStage bubble={false} floor={false} />
        </Box>
        <StepList steps={steps} currentIdx={currentIdx} />
        <ReadyLine phase={phase} />
      </Box>
    </Box>
  );
}
