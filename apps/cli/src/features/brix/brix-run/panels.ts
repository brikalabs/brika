/** READY / PAUSED / GAME OVER overlay sprites. */

import { parseSprite, type Sprite } from '@brika/brix';

function center(text: string, width: number): string {
  const left = Math.floor((width - text.length) / 2);
  return ' '.repeat(left) + text + ' '.repeat(width - text.length - left);
}

function panel(lines: ReadonlyArray<string>, color: string, minWidth: number): Sprite {
  const inner = Math.max(minWidth, ...lines.map((l) => l.length)) + 2;
  const top = `╔${'═'.repeat(inner)}╗`;
  const bot = `╚${'═'.repeat(inner)}╝`;
  const wrap = (text: string): string => `║ ${center(text, inner - 2)} ║`;

  const sprite = parseSprite([top, ...lines.map(wrap), bot].join('\n'));
  return {
    ...sprite,
    rows: sprite.rows.map((row) => row.map((c) => (c ? { ...c, color, bold: true } : null))),
  };
}

export function readyPanel(blink: boolean): Sprite {
  return panel(
    [
      '',
      '✦  B R I X   R U N  ✦',
      '─────────────────────',
      '',
      '  SPACE / ↑   jump',
      '  ↓ / S       duck',
      '  ← →         move',
      '',
      blink ? '▸ press SPACE to play ◂' : '                       ',
      '',
    ],
    'cyan',
    32
  );
}

export function pausedPanel(): Sprite {
  return panel(['', '⏸   PAUSED', '', 'press P to resume', ''], 'yellow', 24);
}

export function gameOverPanel(score: number, best: number): Sprite {
  const newBest = score > 0 && score >= best;
  return panel(
    [
      '',
      '✗   G A M E   O V E R',
      '─────────────────────',
      '',
      `SCORE          ${score.toString().padStart(4, '0')}`,
      `BEST           ${best.toString().padStart(4, '0')}`,
      newBest ? '★  NEW HIGH SCORE  ★' : '',
      '',
      '▸ press R to retry ◂',
      '',
    ],
    'red',
    32
  );
}
