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

import { spawnSync } from 'node:child_process';
import {
  BrixStage,
  confetti,
  defineEmote,
  type EmoteDef,
  EmoteProvider,
  type Origin,
  STAGE_WIDTH,
  timelineDuration,
  useEmote,
} from '@brika/brix';
import { Box, Text } from 'ink';
import type React from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { CLI_VERSION } from '../../version';
import { useExit } from '../runCommandTui';

const POST_EMOTE_TAIL_MS = 2200;
const FOREVER_HOLD_MS = 60_000;
const LABEL_WIDTH = 10;

interface BuildInfo {
  readonly branch: string | null;
  readonly commit: string | null;
  readonly commitDate: string | null;
}

function readBuildInfo(): BuildInfo {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const commit = git(['rev-parse', '--short', 'HEAD']);
  const isoDate = git(['log', '-1', '--format=%cI']);
  return {
    branch,
    commit,
    commitDate: isoDate ? isoDate.slice(0, 10) : null,
  };
}

function git(args: ReadonlyArray<string>): string | null {
  const result = spawnSync('git', [...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0) {
    return null;
  }
  const out = result.stdout.trim();
  return out.length > 0 ? out : null;
}

function buildVersionEmote(): EmoteDef {
  return defineEmote('version', {
    mood: 'starry',
    color: 'cyan',
    hold: FOREVER_HOLD_MS,
    priority: 5,
    particles: (o: Origin) => confetti({ x: o.x + 1, y: o.y, w: o.w - 2, h: o.h }),
    initial: { face: 'happy' },
    beats: [
      { kind: 'tween', cx: 5, ms: 140, ease: 'easeOut' },
      { kind: 'tween', cx: 9, ms: 180, ease: 'easeOut' },
      { kind: 'tween', cx: 7, ms: 140, ease: 'easeOut' },
      { kind: 'tween', h: 2, ms: 120, ease: 'easeIn' },
      { kind: 'tween', h: 4, ms: 100, ease: 'easeOut' },
      { kind: 'face', face: 'starry' },
      { kind: 'impulse', vy: 12 },
      { kind: 'waitLand', maxMs: 1500 },
      { kind: 'tween', h: 2, ms: 100, ease: 'easeIn' },
      { kind: 'tween', h: 3, ms: 140, ease: 'easeOut' },
      { kind: 'face', face: 'happy' },
      { kind: 'wait', ms: 220 },
      { kind: 'face', face: 'love' },
      { kind: 'wait', ms: 240 },
    ],
  });
}

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

interface InfoLineProps {
  readonly label: string;
  readonly color: string;
  readonly children: React.ReactNode;
}

function InfoLine({ label, color, children }: Readonly<InfoLineProps>): React.ReactElement {
  return (
    <Box>
      <Box width={LABEL_WIDTH}>
        <Text color={color} dimColor>
          {label}
        </Text>
      </Box>
      <Box>{children}</Box>
    </Box>
  );
}
