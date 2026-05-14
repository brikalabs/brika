import { Kbd, ScreenChrome, useRouter } from '@brika/tui';
import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { BRAND_LINE, MORTAR_WORDMARK } from '../../brand';
import type { Routes } from '../routes';

/**
 * Keybind reference. Designed to read like a man-page section — clean
 * vertical hierarchy with uppercase section headers, no boxy borders,
 * generous whitespace. Two columns balance the screen so the user
 * doesn't have to scroll.
 */

interface KeyRow {
  /** One or more key chords; alternates separated by `·`. */
  readonly keys: ReadonlyArray<string>;
  readonly description: string;
}

interface Section {
  readonly title: string;
  readonly accent: string;
  readonly entries: ReadonlyArray<KeyRow>;
}

const NAVIGATION: Section = {
  title: 'Navigation',
  accent: 'cyan',
  entries: [
    { keys: ['tab'], description: 'next service' },
    { keys: ['shift+tab'], description: 'previous service' },
    { keys: ['↑', '↓'], description: 'scroll one line' },
    { keys: ['shift+↑', 'shift+↓'], description: 'scroll 10 lines' },
    { keys: ['PgUp', 'PgDn'], description: 'scroll half a page' },
    { keys: ['g'], description: 'top of buffer' },
    { keys: ['G'], description: 'live tail' },
    { keys: ['f'], description: 'toggle fullscreen' },
  ],
};

const SEARCH: Section = {
  title: 'Search',
  accent: 'yellow',
  entries: [
    { keys: ['/'], description: 'open search prompt' },
    { keys: ['Enter'], description: 'commit pattern' },
    { keys: ['Esc'], description: 'cancel · clear search' },
    { keys: ['n'], description: 'next match' },
    { keys: ['N'], description: 'previous match' },
  ],
};

const ACTIONS: Section = {
  title: 'Actions',
  accent: 'green',
  entries: [
    { keys: ['r'], description: 'restart focused service' },
    { keys: ['R'], description: 'restart all services' },
    { keys: ['o'], description: 'open URL in browser' },
    { keys: ['i'], description: 'forward stdin to service' },
    { keys: ['s'], description: 'save logs to file' },
    { keys: ['c'], description: 'copy logs to clipboard' },
  ],
};

const VIEWS: Section = {
  title: 'Views',
  accent: 'magenta',
  entries: [
    { keys: ['?'], description: 'toggle this help' },
    { keys: ['d'], description: 'dependency graph' },
    { keys: ['q', 'Ctrl+C'], description: 'quit (any screen)' },
  ],
};

// Column distribution: longer sections on the left so columns stay
// roughly even-height regardless of terminal width.
const LEFT_COLUMN: ReadonlyArray<Section> = [NAVIGATION, SEARCH];
const RIGHT_COLUMN: ReadonlyArray<Section> = [ACTIONS, VIEWS];

const KEYS_COL = 22;
const DESC_COL = 28;

export function HelpView(): React.ReactElement {
  const router = useRouter<Routes>();
  useInput((input, key) => {
    if (key.escape || input === '?') {
      router.back();
    }
  });

  return (
    <ScreenChrome
      wordmark={MORTAR_WORDMARK}
      brand={BRAND_LINE}
      title="Help"
      hint="? or Esc to close"
    >
      <Box flexDirection="row" gap={4}>
        <Column sections={LEFT_COLUMN} />
        <Column sections={RIGHT_COLUMN} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          Tip: every keybind here works while logs are live-tailing — no need to pause.
        </Text>
      </Box>
    </ScreenChrome>
  );
}

function Column({ sections }: Readonly<{ sections: ReadonlyArray<Section> }>): React.ReactElement {
  return (
    <Box flexDirection="column" gap={1}>
      {sections.map((section) => (
        <SectionBlock key={section.title} section={section} />
      ))}
    </Box>
  );
}

function SectionBlock({ section }: Readonly<{ section: Section }>): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color={section.accent}>
          {section.title.toUpperCase()}
        </Text>
        <Text color={section.accent} dimColor>
          {`  ${'─'.repeat(Math.max(0, KEYS_COL + DESC_COL - section.title.length - 2))}`}
        </Text>
      </Box>
      <Box flexDirection="column" marginTop={0}>
        {section.entries.map((row) => (
          <KeyRowLine key={row.keys.join('+')} row={row} accent={section.accent} />
        ))}
      </Box>
    </Box>
  );
}

function KeyRowLine({
  row,
  accent,
}: Readonly<{ row: KeyRow; accent: string }>): React.ReactElement {
  return (
    <Box>
      <Box width={KEYS_COL} flexShrink={0}>
        <KeyChord keys={row.keys} accent={accent} />
      </Box>
      <Box width={DESC_COL} flexShrink={1}>
        <Text wrap="truncate-end">{row.description}</Text>
      </Box>
    </Box>
  );
}

function KeyChord({
  keys,
  accent,
}: Readonly<{ keys: ReadonlyArray<string>; accent: string }>): React.ReactElement {
  return (
    <Box>
      {keys.map((k, i) => (
        <Box key={k}>
          {i > 0 && <Text dimColor> · </Text>}
          <Kbd color={accent}>{k}</Kbd>
        </Box>
      ))}
    </Box>
  );
}
