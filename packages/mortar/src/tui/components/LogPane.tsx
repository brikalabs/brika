import { Box, Text } from 'ink';
import type React from 'react';
import type { ServiceState } from '../../supervisor';
import { statusColor, statusLabel, summarizeCrash } from '../utils/status';

interface Props {
  readonly service: ServiceState;
  /** Number of lines that fit in the pane. */
  readonly visible: number;
  /** Lines above the tail; `null` = live-tail (auto-scroll). */
  readonly scrollFromBottom: number | null;
  /** Max valid scroll offset (`logs.length - visible`). */
  readonly maxScroll: number;
  /** Active search query (empty = no highlighting). */
  readonly searchQuery: string;
  /** Line index in `service.logs` for the focused match, or `null`. */
  readonly currentMatchLine: number | null;
}

/** Right pane: tail / windowed view of the focused service's log buffer. */
export function LogPane({
  service,
  visible,
  scrollFromBottom,
  maxScroll,
  searchQuery,
  currentMatchLine,
}: Readonly<Props>): React.ReactElement {
  const total = service.logs.length;
  const offset = scrollFromBottom ?? 0;
  const end = Math.max(visible, total - offset);
  const start = Math.max(0, end - visible);
  const window = service.logs.slice(start, end);
  const hasSearch = Boolean(searchQuery);

  const crashDetail =
    service.status.kind === 'crashed' ? summarizeCrash(service.status).detail : null;
  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="gray" paddingX={1}>
      <Box>
        <Text bold>{service.spec.label}</Text>
        <Text dimColor>{'  '}</Text>
        <Text color={statusColor(service.status)}>{statusLabel(service.status)}</Text>
        <Text dimColor>
          {scrollFromBottom === null
            ? ` · live · ${total} lines`
            : ` · paused at -${scrollFromBottom}/${maxScroll} · ${total} lines`}
        </Text>
      </Box>
      {crashDetail && (
        <Box>
          <Text color="red" dimColor>
            ↳ {crashDetail}
          </Text>
        </Box>
      )}
      <Box marginTop={1} flexDirection="column">
        {window.length === 0 ? (
          <Text dimColor>(no output yet)</Text>
        ) : (
          window.map((line, i) => {
            const absIdx = start + i;
            return (
              <HighlightLine
                key={`${service.revision}-${absIdx}`}
                line={line}
                query={searchQuery}
                isCurrent={absIdx === currentMatchLine}
                showGutter={hasSearch}
              />
            );
          })
        )}
      </Box>
    </Box>
  );
}

/**
 * Render `line` with `query` matches background-highlighted. When a
 * search is active we reserve a 2-char gutter on every line so the
 * `▶` cursor jumping between matches doesn't shift surrounding lines.
 */
function HighlightLine({
  line,
  query,
  isCurrent,
  showGutter,
}: Readonly<{
  line: string;
  query: string;
  isCurrent: boolean;
  showGutter: boolean;
}>): React.ReactElement {
  const gutter = computeGutter(showGutter, isCurrent);
  if (!query) {
    return <Text>{`${gutter}${line}`}</Text>;
  }
  const segments = splitOnMatches(line, query);
  return (
    <Text>
      {gutter}
      {segments.map((seg) => {
        // Each segment owns a unique offset within its parent line, so
        // `match:offset` is a stable key across renders even when the
        // text content of two adjacent segments happens to coincide.
        const segKey = `${seg.match ? 'm' : 't'}:${seg.offset}`;
        return seg.match ? (
          <Text key={segKey} backgroundColor="yellow" color="black">
            {seg.text}
          </Text>
        ) : (
          <Text key={segKey}>{seg.text}</Text>
        );
      })}
    </Text>
  );
}

function computeGutter(showGutter: boolean, isCurrent: boolean): string {
  if (!showGutter) {
    return '';
  }
  return isCurrent ? '▶ ' : '  ';
}

interface Segment {
  readonly text: string;
  readonly match: boolean;
  /** Start index in the parent line — stable identity for React keys. */
  readonly offset: number;
}

function splitOnMatches(line: string, query: string): Segment[] {
  const segments: Segment[] = [];
  const lower = line.toLowerCase();
  const needle = query.toLowerCase();
  let i = 0;
  while (i < line.length) {
    const next = lower.indexOf(needle, i);
    if (next < 0) {
      segments.push({ text: line.slice(i), match: false, offset: i });
      break;
    }
    if (next > i) {
      segments.push({ text: line.slice(i, next), match: false, offset: i });
    }
    segments.push({ text: line.slice(next, next + query.length), match: true, offset: next });
    i = next + query.length;
  }
  return segments;
}
