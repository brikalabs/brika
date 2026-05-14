/**
 * Detect a TCP port number from a single log line. Most dev tools
 * announce their bound port to stdout (Vite: "Local: http://localhost:5173/",
 * Bun's `serve`: "Listening on http://localhost:3001", Express: "Server
 * running at http://localhost:3000"). Parsing that string is far more
 * reliable than walking process trees — the service literally tells
 * us where it's listening.
 *
 * Strategy: strip ANSI escapes, then run a small ordered set of
 * regexes against the line. First match wins. Each regex is intended
 * to bias toward intentional "I'm listening at X" announcements;
 * generic `:1234` substrings are NOT matched because dev tool output
 * is noisy (timestamps, PIDs, "took 1234ms", etc. all contain digit
 * runs).
 */

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ESC bytes is the whole job
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;

const URL_PORT_RE = /\bhttps?:\/\/[\w.-]*?:(\d{2,5})\b/i;
const URL_BRACKETED_RE = /\bhttps?:\/\/\[[^\]]+\]:(\d{2,5})\b/i;
const LISTENING_RE =
  /\b(?:listening|listen|bound)\b[^\n]{0,40}?(?:(?:port|on)[\s:=]+|:[ \t]*)(\d{2,5})\b/i;
const RUNNING_RE = /\b(?:running|server|started|ready|live)\b[^\n]{0,40}?:[ \t]*(\d{2,5})\b/i;
const PORT_KV_RE = /\bport[\s:=]+(\d{2,5})\b/i;

const PATTERNS: ReadonlyArray<RegExp> = [
  URL_PORT_RE,
  URL_BRACKETED_RE,
  LISTENING_RE,
  RUNNING_RE,
  PORT_KV_RE,
];

const MIN_PORT = 1;
const MAX_PORT = 65_535;

/**
 * Extract the most likely TCP port the service is announcing. Returns
 * `null` when no pattern matches or the match is outside the valid
 * range.
 */
export function parsePortFromLog(line: string): number | null {
  const cleaned = line.replace(ANSI_RE, '');
  for (const re of PATTERNS) {
    const match = re.exec(cleaned);
    if (!match) {
      continue;
    }
    const captured = match[1];
    if (!captured) {
      continue;
    }
    const n = Number.parseInt(captured, 10);
    if (Number.isFinite(n) && n >= MIN_PORT && n <= MAX_PORT) {
      return n;
    }
  }
  return null;
}
