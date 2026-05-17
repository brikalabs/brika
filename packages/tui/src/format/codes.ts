/**
 * Minecraft-style §code parser for terminal text. Splits an input
 * string into typed segments that `<FormattedText>` can render with
 * Ink `<Text>` props.
 *
 * Supported codes (each consumes 2 chars from the input):
 *
 *   §l   bold
 *   §o   italic
 *   §n   underline
 *   §m   strikethrough
 *   §k   obfuscated — live-randomized characters
 *   §R   rainbow — per-character ROYGBIV cycle, animates
 *   §r   reset all formatting + clear color
 *
 *   §0   black           §8   gray
 *   §1   blue            §9   blue (bright)
 *   §2   green           §a   green (bright)
 *   §3   cyan            §b   cyan (bright)
 *   §4   red             §c   red (bright)
 *   §5   magenta         §d   magenta (bright)
 *   §6   yellow          §e   yellow (bright)
 *   §7   white           §f   white (bright)
 *
 * Unknown `§<x>` sequences pass through as literal characters so a
 * stray "§" never eats surrounding text. Format codes are NOT counted
 * as visible characters — the parser strips them and yields a `plain`
 * string the caller can use for width math.
 */

export type FormatColor =
  | 'black'
  | 'blue'
  | 'green'
  | 'cyan'
  | 'red'
  | 'magenta'
  | 'yellow'
  | 'white'
  | 'blueBright'
  | 'greenBright'
  | 'cyanBright'
  | 'redBright'
  | 'magentaBright'
  | 'yellowBright'
  | 'whiteBright'
  | 'gray';

export interface FormatStyle {
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly strikethrough: boolean;
  readonly obfuscated: boolean;
  readonly rainbow: boolean;
  /** `undefined` means "fall back to the renderer's base text colour". */
  readonly color: FormatColor | undefined;
}

export interface FormatSegment extends FormatStyle {
  readonly text: string;
}

export interface ParsedFormat {
  /** Visible characters with all `§` codes stripped — what the user
   *  actually sees. Use this for width math and truncation. */
  readonly plain: string;
  /** Same content as `plain`, split into formatting runs. */
  readonly segments: ReadonlyArray<FormatSegment>;
}

export const PLAIN_STYLE: FormatStyle = {
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  obfuscated: false,
  rainbow: false,
  color: undefined,
};

const COLOR_MAP: Readonly<Record<string, FormatColor>> = {
  '0': 'black',
  '1': 'blue',
  '2': 'green',
  '3': 'cyan',
  '4': 'red',
  '5': 'magenta',
  '6': 'yellow',
  '7': 'white',
  '8': 'gray',
  '9': 'blueBright',
  a: 'greenBright',
  b: 'cyanBright',
  c: 'redBright',
  d: 'magentaBright',
  e: 'yellowBright',
  f: 'whiteBright',
};

function applyCode(style: FormatStyle, code: string): FormatStyle | null {
  switch (code) {
    case 'l':
      return { ...style, bold: true };
    case 'o':
      return { ...style, italic: true };
    case 'n':
      return { ...style, underline: true };
    case 'm':
      return { ...style, strikethrough: true };
    case 'k':
      return { ...style, obfuscated: true };
    case 'R':
      return { ...style, rainbow: true };
    case 'r':
      return PLAIN_STYLE;
  }
  const color = COLOR_MAP[code];
  if (color) {
    return { ...style, color };
  }
  return null;
}

export function parseFormatCodes(input: string): ParsedFormat {
  const segments: FormatSegment[] = [];
  let buffer = '';
  let style: FormatStyle = PLAIN_STYLE;
  let plain = '';

  const flush = (): void => {
    if (buffer.length === 0) {
      return;
    }
    segments.push({ ...style, text: buffer });
    plain += buffer;
    buffer = '';
  };

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (ch === '§' && i + 1 < input.length) {
      const code = input[i + 1] ?? '';
      const next = applyCode(style, code);
      if (next) {
        flush();
        style = next;
        i += 1;
        continue;
      }
    }
    buffer += ch;
  }
  flush();
  return { plain, segments };
}

/** Append a trailing plain segment so the rendered cell count matches
 *  `target`. Useful when the caller wants the formatted run to fill
 *  the same width as a separately-fitted layout string. */
export function padSegments(
  segments: ReadonlyArray<FormatSegment>,
  target: number
): ReadonlyArray<FormatSegment> {
  const visible = segments.reduce((n, s) => n + s.text.length, 0);
  if (visible >= target) {
    return segments;
  }
  return [...segments, { ...PLAIN_STYLE, text: ' '.repeat(target - visible) }];
}
