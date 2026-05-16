/**
 * `brika version` — Two-column view. Brix performs a quick celebrate
 * animation on the left; runtime metadata (version, branch, commit,
 * build time, runtime, platform) fills the right column.
 *
 *      ╭───╮     Brika Runtime
 *      │^◡^│
 *      ╰───╯     version    0.1.0
 *                branch     feat/cli-tui-brix
 *                commit     dbb904fe (2026-05-15)
 *                runtime    bun 1.3.13
 *                platform   darwin arm64
 *
 * The emote uses a very long `hold` so the stage never advances back
 * to idle — when its timeline ends the last frame stays painted. We
 * wait that natural duration plus a short tail, then exit. Ink keeps
 * the final paint in stdout, so `brika version` leaves the metadata
 * visible in the user's scrollback.
 */

import {
  BrixStage,
  EmoteProvider,
  STAGE_WIDTH,
  timelineDuration,
  useEmote,
} from '@brika/brix';
import { Box, Text } from 'ink';
import type React from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { CLI_VERSION } from '../../version';
import { useExit } from '../../runCommandTui';
import { type BuildInfo, readBuildInfo } from './buildInfo';
import { InfoLine } from './InfoLine';
import { buildVersionEmote } from './versionEmote';

const POST_EMOTE_TAIL_MS = 2200;

export function VersionView(): React.ReactElement {
  const versionEmote = useMemo(() => buildVersionEmote(), []);
  const library = useMemo(() => ({ version: versionEmote }), [versionEmote]);
  const durationMs = useMemo(() => timelineDuration(versionEmote.timeline), [versionEmote]);
  const build = useMemo(() => readBuildInfo(), []);
  return (
    <EmoteProvider library={library}>
      <VersionLayout durationMs={durationMs} build={build} />
    </EmoteProvider>
  );
}

interface VersionLayoutProps {
  readonly durationMs: number;
  readonly build: BuildInfo;
}

function VersionLayout({ durationMs, build }: Readonly<VersionLayoutProps>): React.ReactElement {
  const api = useEmote();
  const exit = useExit();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;
    api.play('version');
  }, [api]);

  useEffect(() => {
    const t = setTimeout(() => exit(), durationMs + POST_EMOTE_TAIL_MS);
    return () => clearTimeout(t);
  }, [exit, durationMs]);

  return (
    <Box>
      <Box width={STAGE_WIDTH}>
        <BrixStage bubble={false} floor={false} />
      </Box>
      <Box flexDirection="column" flexGrow={1} marginLeft={2}>
        <Box>
          <Text bold color="magenta">
            ▰▰{' '}
          </Text>
          <Text bold color="cyan">
            Brika Runtime
          </Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <InfoLine label="version" color="green">
            <Text color="green" bold>
              v{CLI_VERSION}
            </Text>
          </InfoLine>
          {build.branch && (
            <InfoLine label="branch" color="magenta">
              <Text color="magenta">{build.branch}</Text>
            </InfoLine>
          )}
          {build.commit && (
            <InfoLine label="commit" color="yellow">
              <Text color="yellow">{build.commit}</Text>
              {build.commitDate && <Text dimColor>{` (${build.commitDate})`}</Text>}
            </InfoLine>
          )}
          <InfoLine label="runtime" color="cyan">
            <Text color="cyan">bun</Text>
            <Text>{` ${Bun.version}`}</Text>
          </InfoLine>
          <InfoLine label="platform" color="blue">
            <Text color="blue">{process.platform}</Text>
            <Text dimColor>{` ${process.arch}`}</Text>
          </InfoLine>
        </Box>
      </Box>
    </Box>
  );
}
