import { Box, Text } from 'ink';
import type React from 'react';
import { BRAND_LINE } from '../../brand';
import type { SearchControls } from '../state/useSearch';
import { Kbd } from './Kbd';

interface Props {
  readonly search: SearchControls;
  readonly url: string | null;
  readonly urlHealthy: boolean;
  /** Transient feedback message (save/copy results). `null` hides. */
  readonly toast: string | null;
  /** Service id currently in input-forward mode, or `null`. */
  readonly inputModeFor: string | null;
}

/**
 * Bottom strip. Layouts, in priority order:
 *   1. search input prompt (while actively typing a query)
 *   2. input-mode banner (keystrokes forwarded to a child's stdin)
 *   3. toast message (transient action feedback — save/copy/etc.)
 *   4. URL + search results bar (when a query is committed)
 *   5. URL + condensed keybinds (the default)
 *
 * Keybind line is intentionally short — full reference lives in
 * `?`-Help. Brand line is dim and only shown in the default layouts.
 */
export function Footer({
  search,
  url,
  urlHealthy,
  toast,
  inputModeFor,
}: Readonly<Props>): React.ReactElement {
  if (search.mode === 'searching') {
    return <SearchInputLine input={search.input} />;
  }
  if (inputModeFor !== null) {
    return <InputModeLine serviceId={inputModeFor} />;
  }
  return (
    <Box paddingX={1} marginTop={1} flexDirection="column">
      <UrlLine url={url} healthy={urlHealthy} />
      <SecondLine search={search} toast={toast} />
      <BrandLine />
    </Box>
  );
}

function BrandLine(): React.ReactElement {
  return <Text dimColor>{BRAND_LINE}</Text>;
}

function InputModeLine({ serviceId }: Readonly<{ serviceId: string }>): React.ReactElement {
  return (
    <Box paddingX={1} marginTop={1} flexDirection="column">
      <Text>
        <Text backgroundColor="yellow" color="black" bold>
          {' INPUT '}
        </Text>
        <Text> keystrokes → </Text>
        <Text bold>{serviceId}</Text>
        <Text dimColor> </Text>
        <Kbd>Esc</Kbd>
        <Text dimColor> exit</Text>
      </Text>
      <Text dimColor>Ctrl+C is forwarded (sends SIGINT char to child).</Text>
    </Box>
  );
}

function SecondLine({
  search,
  toast,
}: Readonly<{ search: SearchControls; toast: string | null }>): React.ReactElement {
  if (toast !== null) {
    return <Text color="cyan">{toast}</Text>;
  }
  if (search.query) {
    return <SearchStatusLine search={search} />;
  }
  return <KeybindsLine />;
}

function SearchInputLine({ input }: Readonly<{ input: string }>): React.ReactElement {
  return (
    <Box paddingX={1} marginTop={1} flexDirection="column">
      <Text>
        <Text color="yellow">/</Text>
        <Text>{input}</Text>
        <Text color="yellow">█</Text>
      </Text>
      <Text dimColor>
        type pattern · <Kbd>Enter</Kbd> commit · <Kbd>Esc</Kbd> cancel
      </Text>
    </Box>
  );
}

function UrlLine({
  url,
  healthy,
}: Readonly<{ url: string | null; healthy: boolean }>): React.ReactElement {
  if (!url) {
    return <Text dimColor>(no URL for this service)</Text>;
  }
  return (
    <Text>
      <Text dimColor>→ </Text>
      <Text color={healthy ? 'cyan' : 'gray'}>{url}</Text>
      <Text dimColor> </Text>
      <Kbd>o</Kbd>
      <Text dimColor>{healthy ? ' open' : ' (waiting…)'}</Text>
    </Text>
  );
}

function SearchStatusLine({ search }: Readonly<{ search: SearchControls }>): React.ReactElement {
  const status =
    search.matches.length > 0
      ? `${search.currentMatchIdx + 1}/${search.matches.length}`
      : 'no matches';
  return (
    <Text>
      <Text dimColor>Search </Text>
      <Text color="yellow">{search.query}</Text>
      <Text dimColor>{`  ${status}  `}</Text>
      <Kbd>n</Kbd>
      <Text dimColor> </Text>
      <Kbd>N</Kbd>
      <Text dimColor> next/prev · </Text>
      <Kbd>Esc</Kbd>
      <Text dimColor> clear</Text>
    </Text>
  );
}

function KeybindsLine(): React.ReactElement {
  // Condensed essentials. Full reference is one tap away under `?`.
  return (
    <Text>
      <Kbd>tab</Kbd>
      <Text dimColor> switch </Text>
      <Kbd>r</Kbd>
      <Text dimColor> restart </Text>
      <Kbd>/</Kbd>
      <Text dimColor> search </Text>
      <Kbd>d</Kbd>
      <Text dimColor> deps </Text>
      <Kbd>?</Kbd>
      <Text dimColor> help </Text>
      <Kbd>q</Kbd>
      <Text dimColor> quit</Text>
    </Text>
  );
}
