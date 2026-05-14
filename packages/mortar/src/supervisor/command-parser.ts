/**
 * Shell-style command tokenizer. Splits a single command string into
 * argv so authors can inline JS in YAML (e.g. `bun -e "console.log(1)"`)
 * without writing a wrapper script.
 *
 * Supports:
 *   - whitespace-separated tokens
 *   - `"..."` and `'...'` quoting (no nesting, no interpolation)
 *   - quote concatenation: `foo"bar baz"` → `foobar baz`
 *
 * Intentionally does NOT support backslash escapes — it's a YAML
 * config field, not a shell. Authors who need a real shell can wrap
 * the command in `bash -c "..."`.
 */

import { CommandParseError } from '../errors';

export function splitCommand(command: string): string[] {
  const out: string[] = [];
  let buf = '';
  let inToken = false;
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch === undefined) {
      break;
    }
    if (quote) {
      if (ch === quote) {
        quote = null;
        continue;
      }
      buf += ch;
      inToken = true;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      inToken = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (inToken) {
        out.push(buf);
        buf = '';
        inToken = false;
      }
      continue;
    }
    buf += ch;
    inToken = true;
  }
  if (quote) {
    throw new CommandParseError(`service command has an unclosed ${quote} quote`);
  }
  if (inToken) {
    out.push(buf);
  }
  if (out.length === 0) {
    throw new CommandParseError('service command is empty');
  }
  return out;
}
