/**
 * Layout for the brika TUI header: Brix on the left, a speech bubble
 * immediately to his right. All the behaviour lives in the hooks —
 * this module is just the wiring + render.
 *
 *   ╭───────────────╮       ╭───────────────────────────╮
 *   │  (the stage)  │    ◀──┤  hub is humming along.    │
 *   ╰───────────────╯       ╰───────────────────────────╯
 *
 * Knockback: pokes call `useBrixImpulse().impulse(vx, vy)` from
 * inside `usePoke`; `<BrixStage>` reads the same physics provider's
 * offset and shifts the mascot inside its own canvas. The layout here
 * is back to plain flex — we just pass a taller `height` so the stage
 * has vertical room for a jump apex. Bubble alignment uses
 * `flex-end` so it stays anchored at the resting feet level.
 *
 * Rich text: dialogue may include §codes (`§l` bold, `§o` italic, `§k`
 * obfuscated, `§R` rainbow, `§0`–`§f` colors, `§r` reset). Parsing and
 * rendering live in `@brika/tui/format`; the bubble's `renderContent`
 * slot plugs the formatted view in over the default flat text.
 */

import {
  BrixStage,
  Bubble,
  type BubbleContentRenderer,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from '@brika/brix';
import {
  FormattedText,
  padSegments,
  parseFormatCodes,
  useClickable,
  useTerminalSize,
} from '@brika/tui';
import { Box, type DOMElement } from 'ink';
import type React from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useCli } from '../../hooks/useCli';
import { BUBBLE_MAX_WIDTH, BUBBLE_MIN_WIDTH, HEADER_CHROME, JUMP_HEADROOM } from './constants';
import type { HubState } from './lines';
import { Tombstone } from './Tombstone';
import { useBubbleStream } from './useBubbleStream';
import { useEmoteSync } from './useEmoteSync';
import { useIdleChatter } from './useIdleChatter';
import { type Life, usePoke } from './usePoke';

function asHubState(state: string): HubState {
  switch (state) {
    case 'running':
    case 'stale':
    case 'stopped':
      return state;
    default:
      return 'unknown';
  }
}

export function BrixHeaderInner(): React.ReactElement {
  const cli = useCli();
  const { hub, mood, statusText, activityEmote } = cli;
  const hubState = asHubState(hub.state);
  const { columns } = useTerminalSize();
  const bubbleWidth = Math.min(
    BUBBLE_MAX_WIDTH,
    Math.max(BUBBLE_MIN_WIDTH, columns - HEADER_CHROME)
  );

  // Life state is owned here so we can derive `frozen` for the bubble
  // stream BEFORE that hook runs — usePoke needs the bubble's dispatch
  // (which forces useBubbleStream to be called first), so the cycle is
  // resolved by sharing `life` via this state instead of having usePoke
  // own it. Dying / tombstone phases freeze the bubble's auto-effects.
  const [life, setLife] = useState<Life>({ phase: 'alive' });
  const frozen = life.phase !== 'alive';

  useEmoteSync(hubState, activityEmote, !frozen);
  const bubble = useBubbleStream(hubState, statusText, mood, frozen);
  useIdleChatter(bubble.state.phase, hubState, mood, bubble.dispatch, !frozen);
  const { onPoke } = usePoke({ dispatch: bubble.dispatch, life, setLife });

  const brixRef = useRef<DOMElement>(null);
  useClickable(brixRef, onPoke);

  // Strip §codes once per cursor advance, then hand the plain string to
  // the bubble for width math and the segments to the renderContent
  // slot for rich rendering.
  const parsed = useMemo(() => parseFormatCodes(bubble.bubbleText), [bubble.bubbleText]);

  const renderContent = useCallback<BubbleContentRenderer>(
    (fitted, { textColor, dim }) => (
      <FormattedText
        segments={padSegments(parsed.segments, fitted.length)}
        baseColor={textColor}
        dim={dim}
      />
    ),
    [parsed.segments]
  );

  // Pass the stage a taller canvas so the physics provider has room to
  // lift Brix on a jump. The stage anchors the floor at the bottom row,
  // so the extra rows become "sky" above the resting sprite.
  const stageHeight = STAGE_HEIGHT + JUMP_HEADROOM;

  return (
    <Box alignItems="flex-end">
      <Box ref={brixRef}>
        {life.phase === 'tombstone' ? (
          <Tombstone width={STAGE_WIDTH} height={stageHeight} />
        ) : (
          <BrixStage
            bubble={false}
            floor={false}
            width={STAGE_WIDTH}
            height={stageHeight}
            speaking={bubble.speaking}
          />
        )}
      </Box>
      <Box height={STAGE_HEIGHT} marginLeft={1} alignItems="center">
        <Bubble
          text={parsed.plain}
          width={bubbleWidth}
          variant="speech"
          tail="left"
          borderColor={bubble.bubbleTint}
          dim={bubble.bubbleDim}
          renderContent={renderContent}
        />
      </Box>
    </Box>
  );
}
