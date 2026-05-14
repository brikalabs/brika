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

type Quote = '"' | "'" | null;

interface TokenizerState {
  buf: string;
  inToken: boolean;
  quote: Quote;
}

const WHITESPACE_RE = /\s/;

export function splitCommand(command: string): string[] {
  const out: string[] = [];
  const state: TokenizerState = { buf: '', inToken: false, quote: null };

  for (const ch of command) {
    consume(ch, state, out);
  }
  if (state.quote) {
    throw new CommandParseError(`service command has an unclosed ${state.quote} quote`);
  }
  if (state.inToken) {
    out.push(state.buf);
  }
  if (out.length === 0) {
    throw new CommandParseError('service command is empty');
  }
  return out;
}

/** One step of the tokenizer state machine. */
function consume(ch: string, state: TokenizerState, out: string[]): void {
  if (state.quote) {
    consumeInsideQuote(ch, state);
    return;
  }
  if (ch === '"' || ch === "'") {
    state.quote = ch;
    state.inToken = true;
    return;
  }
  if (WHITESPACE_RE.test(ch)) {
    finishToken(state, out);
    return;
  }
  state.buf += ch;
  state.inToken = true;
}

function consumeInsideQuote(ch: string, state: TokenizerState): void {
  if (ch === state.quote) {
    state.quote = null;
    return;
  }
  state.buf += ch;
  state.inToken = true;
}

function finishToken(state: TokenizerState, out: string[]): void {
  if (!state.inToken) {
    return;
  }
  out.push(state.buf);
  state.buf = '';
  state.inToken = false;
}
