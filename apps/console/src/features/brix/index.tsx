/** Brix Run — orchestrator. Modules live under ./brix-run/. */

import { SpriteView } from '@brika/brix';
import { useMeasure } from '@brika/tui';
import { Box } from 'ink';
import type React from 'react';
import { useEffect, useMemo, useReducer } from 'react';
import { FALLBACK_WORLD_HEIGHT, FALLBACK_WORLD_WIDTH } from './brix-run/constants';
import { geomOf, worldDimsFromCanvas } from './brix-run/geometry';
import { Hud, KeyHints, Title } from './brix-run/Hud';
import { useGameInput, useGameLoop, useGameSounds } from './brix-run/hooks';
import { makeInitial } from './brix-run/initial';
import { borderColorFor, renderWorld } from './brix-run/render';
import { reduce } from './brix-run/state';

export function BrixView(): React.ReactElement {
  const [canvasRef, canvasSize] = useMeasure();
  const { width: worldWidth, height: worldHeight } = worldDimsFromCanvas(
    canvasSize.width,
    canvasSize.height
  );

  const [state, dispatch] = useReducer(reduce, undefined, () =>
    makeInitial(0, FALLBACK_WORLD_WIDTH, FALLBACK_WORLD_HEIGHT)
  );

  useEffect(() => {
    dispatch({ type: 'resize', width: worldWidth, height: worldHeight });
  }, [worldWidth, worldHeight]);

  useGameLoop(dispatch);
  useGameInput(dispatch);
  useGameSounds(state);

  const composed = useMemo(
    () => renderWorld(state, geomOf(state.worldWidth, state.worldHeight)),
    [state]
  );

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Title />
      <Hud score={state.score} best={state.best} scrollSpeed={state.scrollSpeed} />
      <Box ref={canvasRef} flexGrow={1} justifyContent="center" alignItems="center">
        <Box
          borderStyle="round"
          borderColor={borderColorFor(state.status)}
          paddingX={1}
          width={state.worldWidth + 4}
          height={state.worldHeight + 2}
        >
          <SpriteView sprite={composed} />
        </Box>
      </Box>
      <KeyHints />
    </Box>
  );
}
