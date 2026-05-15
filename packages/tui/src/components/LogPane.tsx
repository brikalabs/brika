import { Box, Text } from 'ink';
import type React from 'react';
import { statusColor, statusLabel, summarizeCrash, type TuiStatus } from '../utils/status';

interface Props {
  /** Header label for the pane — usually the source's display name. */
  readonly label: string;
  /** The full log buffer (oldest first). */
  readonly lines: ReadonlyArray<string>;
  /** Monotonic counter that ticks when `lines` changes — used for stable React keys. */
  readonly revision: number;
  /** Number of lines that fit in the pane. */
  readonly visible: number;
  /** Lines above the tail; `null` = live-tail (auto-scroll). */
  readonly scrollFromBottom: number | null;
  /** Max valid scroll offset (`lines.length - visible`). */
  readonly maxScroll: number;
  /** Active search query (empty = no highlighting). */
  readonly searchQuery: string;
  /** Line index in `lines` for the focused match, or `null`. */
  readonly currentMatchLine: number | null;
  /** Optional status — drives the colored label next to the title. */
  readonly status?: TuiStatus;
  /**
   * Per-line custom renderer. Used only when no search query is
   * active — when search is on we fall back to the plain string so
   * the yellow match overlay keeps working. The callback receives
   * the line and its absolute index in `lines`, so consumers can
   * pull from a parallel typed buffer (e.g. `events[i]`).
   */
  readonly renderLine?: (line: string, absIdx: number) => React.ReactNode;
}

/** Right pane: tail / windowed view of a log buffer. */
export function LogPane({
  label,
  lines,
  revision,
  visible,
  scrollFromBottom,
  maxScroll,
  searchQuery,
  currentMatchLine,
  status,
  renderLine,
}: Readonly<Props>): React.ReactElement {
  const total = lines.length;
  const offset = scrollFromBottom ?? 0;
  const end = Math.max(visible, total - offset);
  const start = Math.max(0, end - visible);
  const window = lines.slice(start, end);
  const hasSearch = Boolean(searchQuery);

  const crashDetail = status?.kind === 'crashed' ? summarizeCrash(status).detail : null;
  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="gray" paddingX={1}>
      <Box>
        <Text bold>{label}</Text>
        {status && (
          <>
            <Text dimColor>{'  '}</Text>
            <Text color={statusColor(status)}>{statusLabel(status)}</Text>
          </>
        )}
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
                key={`${revision}-${absIdx}`}
                line={line}
                absIdx={absIdx}
                query={searchQuery}
                isCurrent={absIdx === currentMatchLine}
                showGutter={hasSearch}
                renderLine={renderLine}
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
  absIdx,
  query,
  isCurrent,
  showGutter,
  renderLine,
}: Readonly<{
  line: string;
  absIdx: number;
  query: string;
  isCurrent: boolean;
  showGutter: boolean;
  renderLine?: (line: string, absIdx: number) => React.ReactNode;
}>): React.ReactElement {
  const gutter = computeGutter(showGutter, isCurrent);
  if (!query) {
    return (
      <Text>
        {gutter}
        {renderLine ? renderLine(line, absIdx) : line}
      </Text>
    );
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
