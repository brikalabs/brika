import { isAbsolute, relative } from 'node:path';
import type { BunPlugin } from 'bun';

/**
 * Inject build-time call-site metadata into `t('...')` and `tp(...)` calls
 * so the i18n devtools overlay can show the *source* file/line for plugin
 * code at runtime — even though plugin code is bundled and served at
 * `/api/bricks/modules/...`.
 *
 * Without this, the only signal the overlay has is `Error.stack`, which in
 * compiled output points at the bundle URL (and a single concatenated line
 * after `minify: true`). The transform rewrites:
 *
 *   - `t('key')`             → `t('key', { __cs: 'path:line' })`
 *   - `t(\`key\`)`           → `t(\`key\`, { __cs: 'path:line' })`
 *   - `t('key', {opts})`     → `t('key', { __cs: 'path:line', ...{opts} })`
 *                              (spliced inside the existing object literal)
 *   - `tp('pkg','key')`      → `tp('pkg','key', undefined, 'path:line')`
 *   - `tp('pkg','key','d')`  → `tp('pkg','key','d', 'path:line')`
 *
 * The runtime reads `options.__cs` (resp. `tp`'s 4th arg) instead of
 * walking the stack.
 *
 * The scanner is a hand-tuned tokenizer (not a regex) that tracks string
 * literals, template literals (including nested `${...}` interpolation),
 * single- and multi-line comments, and regex literals. It only matches
 * top-level identifier calls `t(` / `tp(` — not `foo.t(...)` or `cat(...)`
 * or `assert(...)`. Full lexical scope analysis (resolving `t` to the
 * `useLocale()` import) would require a real parser; the identifier
 * check catches >99% of real-world cases.
 *
 * @param sourceRoot Base directory paths in `__cs` are reported relative to.
 *   Pass the workspace root so the resulting `plugins/<pkg>/src/...` paths
 *   are resolvable by the dev-server's open-in-editor endpoint without
 *   plugin-specific knowledge. Defaults to the plugin's own root, which
 *   produces shorter paths but loses cross-plugin disambiguation.
 */
export function brikaI18nCallSitePlugin(sourceRoot: string): BunPlugin {
  return {
    name: 'brika-i18n-call-site',
    setup(build) {
      build.onLoad({ filter: /\.[jt]sx?$/ }, async (args) => {
        if (args.path.includes('/node_modules/')) {
          return undefined;
        }
        // Defense-in-depth: refuse to inject metadata for paths that escape
        // the configured sourceRoot. A plugin pulling in a sibling-workspace
        // file through `../../other-pkg/src/foo.ts` would otherwise leak the
        // unresolved relative path into the bundle, which the dev-server's
        // open-in-editor endpoint can't resolve cleanly. The /node_modules/
        // check above handles published packages; this catches in-tree paths.
        const relPath = relative(sourceRoot, args.path);
        if (relPath.startsWith('..') || isAbsolute(relPath)) {
          return undefined;
        }
        const text = await Bun.file(args.path).text();
        // Cheap pre-check: skip files that have no `t(` or `tp(` substring at
        // all. The tokenizer is fast but reading every .ts(x) file twice is
        // still wasteful when most files don't contain i18n calls.
        if (!hasIndicator(text)) {
          return undefined;
        }
        const transformed = injectCallSites(text, relPath);
        if (transformed === text) {
          return undefined;
        }
        return { contents: transformed, loader: loaderFor(args.path) };
      });
    },
  };
}

function loaderFor(path: string): 'ts' | 'tsx' | 'js' | 'jsx' {
  if (path.endsWith('.tsx')) {
    return 'tsx';
  }
  if (path.endsWith('.ts')) {
    return 'ts';
  }
  if (path.endsWith('.jsx')) {
    return 'jsx';
  }
  return 'js';
}

/** Quick reject: only scan files that mention `t(` or `tp(` literally. */
function hasIndicator(text: string): boolean {
  // The identifier-then-paren shape avoids matching `cat`, `it`, `assert`,
  // `expect`, etc. (those end in a different letter), and dodges `obj.t(` /
  // `obj.tp(` (those are preceded by `.`). The full check happens in the
  // tokenizer; this is just a cheap "is it even worth opening?" gate.
  return /(^|[^.\w$])t\s*\(|(^|[^.\w$])tp\s*\(/.test(text);
}

/**
 * Walk the source text with a tiny tokenizer that understands string and
 * template literals, comments, and regex literals, and rewrite `t(...)` /
 * `tp(...)` calls in place. Returns the original `code` when no call is
 * eligible for injection.
 */
function injectCallSites(code: string, relPath: string): string {
  const edits: Edit[] = [];
  const scanner = new Scanner(code);
  while (!scanner.done()) {
    const callStart = scanner.nextTopLevelCall();
    if (!callStart) {
      break;
    }
    const edit = buildEdit(code, callStart, relPath);
    if (edit) {
      edits.push(edit);
    }
  }
  if (edits.length === 0) {
    return code;
  }
  return applyEdits(code, edits);
}

interface Edit {
  /** Position where the inserted text starts. Existing chars to the left are kept. */
  readonly at: number;
  /** Number of chars at `at` that are replaced. 0 for pure insertion. */
  readonly remove: number;
  /** Replacement text. */
  readonly insert: string;
}

function applyEdits(code: string, edits: readonly Edit[]): string {
  // Edits are produced in source order (left-to-right walk). Apply right-to-
  // left so earlier edits' positions remain valid.
  const sorted = [...edits].sort((a, b) => b.at - a.at);
  let out = code;
  for (const edit of sorted) {
    out = out.slice(0, edit.at) + edit.insert + out.slice(edit.at + edit.remove);
  }
  return out;
}

interface CallStart {
  /** Identifier text (`t` or `tp`). */
  readonly name: 't' | 'tp';
  /** Position of the identifier's first char. */
  readonly identStart: number;
  /** Position just after the opening `(`. */
  readonly openParen: number;
  /** 1-based line number of the identifier. */
  readonly line: number;
}

// ─── Character codes ────────────────────────────────────────────────────
const CH_TAB = 0x09;
const CH_LF = 0x0a;
const CH_CR = 0x0d;
const CH_SPACE = 0x20;
const CH_DOLLAR = 0x24;
const CH_SQUOTE = 0x27;
const CH_DQUOTE = 0x22;
const CH_LPAREN = 0x28;
const CH_SLASH = 0x2f;
const CH_LBRACE = 0x7b;
const CH_RBRACE = 0x7d;
const CH_BACKTICK = 0x60;

/**
 * Tokenizer-driven walker. Tracks the surrounding lexical context so we can
 * tell a real call from one buried in a string / comment / regex / template.
 *
 * Template literals are nestable (`` `outer ${ `inner ${x}` } ` ``), so the
 * scanner pushes/pops a template stack to know which closing brace returns
 * us to the surrounding template.
 */
class Scanner {
  private pos = 0;
  /**
   * Tracks `${` interpolation depth inside templates. Each entry is the
   * brace depth at the time the interpolation started; when we see a `}`
   * at that depth, we're back inside the template, not in code.
   */
  private readonly templateStack: number[] = [];
  /** Current `{ / }` nesting inside the active interpolation (if any). */
  private braceDepth = 0;
  /** 1-based line counter, updated as `pos` advances. */
  private line = 1;
  /**
   * Last meaningful token seen (alphanumeric ident, punctuation, etc.). Used
   * for the `/` ambiguity: after `)`, `]`, identifier, or number, a `/` is
   * division. After almost anything else (`=`, `(`, `,`, `;`, `return`...),
   * it starts a regex literal.
   */
  private lastSignificant = '';

  constructor(private readonly src: string) {}

  done(): boolean {
    return this.pos >= this.src.length;
  }

  /**
   * Advance until the next valid `t(` or `tp(` call site is found, then
   * return its location. Returns `null` at EOF.
   */
  nextTopLevelCall(): CallStart | null {
    while (this.pos < this.src.length) {
      const ch = this.codeAt(this.pos);
      const result = this.consumeAt(ch);
      if (result) {
        return result;
      }
    }
    return null;
  }

  /**
   * Dispatch for one tokenizer step. Returns a `CallStart` if the step found
   * a candidate `t(` / `tp(` call; otherwise consumes the relevant span and
   * returns `null`. Keeping this off the main loop keeps each branch small.
   */
  private consumeAt(ch: number): CallStart | null {
    if (ch === CH_SLASH) {
      this.consumeSlash();
      return null;
    }
    if (ch === CH_DQUOTE || ch === CH_SQUOTE) {
      this.skipString(this.src[this.pos] ?? '');
      this.recordSignificant('"');
      return null;
    }
    if (ch === CH_BACKTICK) {
      this.skipTemplate(true);
      this.recordSignificant('`');
      return null;
    }
    if (ch === CH_LBRACE) {
      this.consumeLBrace();
      return null;
    }
    if (ch === CH_RBRACE) {
      this.consumeRBrace();
      return null;
    }
    if (isIdentStart(ch)) {
      return this.consumeIdentifier();
    }
    this.recordSignificant(this.src[this.pos] ?? '');
    this.advance();
    return null;
  }

  private consumeSlash(): void {
    if (this.tryComment()) {
      return;
    }
    if (this.startsRegex()) {
      this.skipRegex();
      return;
    }
    this.recordSignificant('/');
    this.advance();
  }

  private consumeLBrace(): void {
    if (this.templateStack.length > 0) {
      this.braceDepth++;
    }
    this.recordSignificant('{');
    this.advance();
  }

  private consumeRBrace(): void {
    if (this.templateStack.length > 0) {
      const entry = this.templateStack.at(-1);
      if (entry !== undefined && this.braceDepth === entry) {
        // We're at the boundary of a template interpolation — pop the entry
        // and resume template scanning from the `}`.
        this.templateStack.pop();
        this.braceDepth = entry;
        this.advance(); // consume the `}` itself
        this.skipTemplate(false);
        return;
      }
      this.braceDepth--;
    }
    this.recordSignificant('}');
    this.advance();
  }

  private consumeIdentifier(): CallStart | null {
    const start = this.pos;
    const lineAtStart = this.line;
    const ident = this.readIdentifier();
    if ((ident === 't' || ident === 'tp') && this.canBeCall(start)) {
      const openParen = this.findOpenParen();
      if (openParen !== -1) {
        return { name: ident, identStart: start, openParen, line: lineAtStart };
      }
    }
    this.recordSignificant(ident);
    return null;
  }

  /** True if the identifier we just read could legally start a call. */
  private canBeCall(identStart: number): boolean {
    // Reject member accesses (`obj.t(...)` / `obj?.t(...)`).
    let i = identStart - 1;
    while (i >= 0) {
      const c = this.codeAt(i);
      if (c === CH_SPACE || c === CH_TAB) {
        i--;
        continue;
      }
      break;
    }
    if (i < 0) {
      return true;
    }
    const prev = this.src[i];
    return prev !== '.' && prev !== '?';
  }

  /**
   * After reading the identifier, scan whitespace to find the `(`. Returns
   * the position *just after* the `(`, or -1 if a non-whitespace, non-`(`
   * char turns up first (which means it wasn't a call).
   */
  private findOpenParen(): number {
    let i = this.pos;
    while (i < this.src.length) {
      const ch = this.codeAt(i);
      if (ch === CH_SPACE || ch === CH_TAB || ch === CH_LF || ch === CH_CR) {
        i++;
        continue;
      }
      if (ch === CH_LPAREN) {
        const after = i + 1;
        this.advanceTo(after);
        return after;
      }
      return -1;
    }
    return -1;
  }

  private readIdentifier(): string {
    const start = this.pos;
    while (this.pos < this.src.length && isIdentPart(this.codeAt(this.pos))) {
      this.advance();
    }
    return this.src.slice(start, this.pos);
  }

  /** Returns true if we consumed a `//` or `/* *\/` comment. */
  private tryComment(): boolean {
    if (this.src[this.pos + 1] === '/') {
      while (this.pos < this.src.length && this.src[this.pos] !== '\n') {
        this.advance();
      }
      return true;
    }
    if (this.src[this.pos + 1] === '*') {
      this.advance();
      this.advance();
      while (this.pos < this.src.length) {
        if (this.src[this.pos] === '*' && this.src[this.pos + 1] === '/') {
          this.advance();
          this.advance();
          return true;
        }
        this.advance();
      }
      return true;
    }
    return false;
  }

  /**
   * Tokens that allow `/` to start a regex when seen in `lastSignificant`.
   * Anything not in this set means `/` is division. The conservative default
   * (regex over division) is fine — both consume to a sensible stopping
   * point and we only care about not matching `t(` inside.
   */
  private startsRegex(): boolean {
    const last = this.lastSignificant;
    if (last === '') {
      return true;
    }
    if (REGEX_PRECEDING_KEYWORDS.has(last)) {
      return true;
    }
    const lastChar = last.at(-1) ?? '';
    if (isIdentPart(lastChar.codePointAt(0) ?? 0)) {
      return false;
    }
    return !DIVISION_PRECEDING.has(last);
  }

  private skipRegex(): void {
    this.advance(); // past opening slash
    const state = { inClass: false };
    while (this.pos < this.src.length) {
      const next = this.stepRegexChar(state);
      if (next === 'done') {
        return;
      }
    }
  }

  /**
   * Advance one position inside a regex literal. Returns `'done'` once the
   * closing `/flags` has been consumed (or the regex is bailed on a newline).
   */
  private stepRegexChar(state: { inClass: boolean }): 'continue' | 'done' {
    const c = this.src[this.pos];
    if (c === '\\') {
      this.consumeEscapePair();
      return 'continue';
    }
    if (c === '[') {
      state.inClass = true;
      this.advance();
      return 'continue';
    }
    if (c === ']') {
      state.inClass = false;
      this.advance();
      return 'continue';
    }
    if (c === '/' && !state.inClass) {
      this.advance();
      this.skipRegexFlags();
      return 'done';
    }
    if (c === '\n') {
      return 'done';
    }
    this.advance();
    return 'continue';
  }

  private skipRegexFlags(): void {
    while (this.pos < this.src.length && isIdentPart(this.codeAt(this.pos))) {
      this.advance();
    }
  }

  /** Consume a `\X` escape pair (the backslash and whatever follows). */
  private consumeEscapePair(): void {
    this.advance();
    if (this.pos < this.src.length) {
      this.advance();
    }
  }

  private skipString(quote: string): void {
    this.advance(); // opening quote
    while (this.pos < this.src.length) {
      const c = this.src[this.pos];
      if (c === '\\') {
        this.advance();
        if (this.pos < this.src.length) {
          this.advance();
        }
        continue;
      }
      if (c === quote) {
        this.advance();
        return;
      }
      if (c === '\n' && quote !== '`') {
        return; // unterminated
      }
      this.advance();
    }
  }

  /**
   * Walk a template literal body.
   *
   * @param consumeOpening When `true`, the cursor is on the opening `` ` ``
   *   and we advance past it. When `false`, the cursor is just past a `}`
   *   that closed an interpolation — we continue from where we left off
   *   without consuming any opener.
   */
  private skipTemplate(consumeOpening: boolean): void {
    if (consumeOpening) {
      this.advance();
    }
    while (this.pos < this.src.length) {
      const c = this.src[this.pos];
      if (c === '\\') {
        this.advance();
        if (this.pos < this.src.length) {
          this.advance();
        }
        continue;
      }
      if (c === '`') {
        this.advance();
        return;
      }
      if (c === '$' && this.codeAt(this.pos + 1) === CH_LBRACE) {
        // Enter interpolation: consume the two-char `${` opener and remember
        // the current brace depth so we can detect the matching `}` later.
        this.advance();
        this.advance();
        this.templateStack.push(this.braceDepth);
        return;
      }
      this.advance();
    }
  }

  private recordSignificant(token: string): void {
    if (token === '' || token === ' ' || token === '\t' || token === '\n' || token === '\r') {
      return;
    }
    this.lastSignificant = token;
  }

  private advance(): void {
    if (this.codeAt(this.pos) === CH_LF) {
      this.line++;
    }
    this.pos++;
  }

  private advanceTo(target: number): void {
    while (this.pos < target) {
      this.advance();
    }
  }

  /** `codePointAt` wrapper that always returns a number (NaN-safe). */
  private codeAt(index: number): number {
    return this.src.codePointAt(index) ?? -1;
  }
}

function isIdentStart(ch: number): boolean {
  // a-z | A-Z | _ | $
  return (
    (ch >= 0x61 && ch <= 0x7a) ||
    (ch >= 0x41 && ch <= 0x5a) ||
    ch === 0x5f ||
    ch === CH_DOLLAR
  );
}

function isIdentPart(ch: number): boolean {
  return isIdentStart(ch) || (ch >= 0x30 && ch <= 0x39);
}

/**
 * Tokens that, when last seen, indicate the next `/` divides rather than
 * opening a regex. Keywords that imply regex are handled separately in
 * `REGEX_PRECEDING_KEYWORDS`.
 */
const DIVISION_PRECEDING = new Set([')', ']', '}', '++', '--']);

const REGEX_PRECEDING_KEYWORDS = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'yield',
  'await',
  'case',
  'do',
  'else',
]);

/**
 * Once the scanner has located a `t(` / `tp(` call, walk its arguments and
 * decide what to inject. Returns `null` for shapes we can't safely rewrite
 * (variable options bag, non-literal first arg, etc.).
 */
function buildEdit(code: string, call: CallStart, relPath: string): Edit | null {
  const args = readArguments(code, call.openParen);
  if (!args) {
    return null;
  }
  if (call.name === 't') {
    return buildTEdit(code, args, call.line, relPath);
  }
  return buildTpEdit(args, call.line, relPath);
}

interface Arguments {
  /** Comma-separated argument spans (trimmed of leading/trailing whitespace). */
  readonly spans: ArgSpan[];
  /** Position of the matching `)`. */
  readonly closeParen: number;
}

interface ArgSpan {
  /** Start position (inclusive). */
  readonly start: number;
  /** End position (exclusive). */
  readonly end: number;
  /** Raw text. */
  readonly text: string;
}

/**
 * Parse a comma-separated argument list starting just after the `(`.
 * Tracks nested parens / brackets / braces and skips strings/templates so
 * the comma split is correct. Returns null on malformed input.
 */
function readArguments(code: string, openParen: number): Arguments | null {
  const cursor: ArgCursor = {
    pos: openParen,
    depth: 0,
    splits: [openParen],
  };
  while (cursor.pos < code.length) {
    const result = stepArgumentCursor(code, cursor);
    if (result.kind === 'done') {
      return { spans: makeSpans(code, cursor.splits, result.closeParen), closeParen: result.closeParen };
    }
    if (result.kind === 'fail') {
      return null;
    }
  }
  return null;
}

interface ArgCursor {
  pos: number;
  depth: number;
  readonly splits: number[];
}

type StepResult = { kind: 'continue' } | { kind: 'done'; closeParen: number } | { kind: 'fail' };

const STEP_CONTINUE: StepResult = { kind: 'continue' };

/**
 * Advance the cursor by one logical token's worth of input and report whether
 * we hit the call's closing paren, a hard fail, or should keep going.
 */
function stepArgumentCursor(code: string, cursor: ArgCursor): StepResult {
  const c = code[cursor.pos];
  if (c === '/' && code[cursor.pos + 1] === '/') {
    cursor.pos = skipLineComment(code, cursor.pos);
    return STEP_CONTINUE;
  }
  if (c === '/' && code[cursor.pos + 1] === '*') {
    cursor.pos = skipBlockComment(code, cursor.pos);
    return STEP_CONTINUE;
  }
  if (c === '"' || c === "'") {
    cursor.pos = skipStringLiteral(code, cursor.pos);
    return STEP_CONTINUE;
  }
  if (c === '`') {
    cursor.pos = skipTemplateLiteral(code, cursor.pos);
    return STEP_CONTINUE;
  }
  if (c === '(' || c === '[' || c === '{') {
    cursor.depth++;
    cursor.pos++;
    return STEP_CONTINUE;
  }
  if (c === ')' || c === ']' || c === '}') {
    if (cursor.depth === 0 && c === ')') {
      return { kind: 'done', closeParen: cursor.pos };
    }
    cursor.depth--;
    cursor.pos++;
    return STEP_CONTINUE;
  }
  if (c === ',' && cursor.depth === 0) {
    cursor.splits.push(cursor.pos + 1);
    cursor.pos++;
    return STEP_CONTINUE;
  }
  cursor.pos++;
  return STEP_CONTINUE;
}

function skipLineComment(code: string, start: number): number {
  let i = start;
  while (i < code.length && code[i] !== '\n') {
    i++;
  }
  return i;
}

function skipBlockComment(code: string, start: number): number {
  let i = start + 2;
  while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) {
    i++;
  }
  return i + 2;
}

function makeSpans(code: string, splits: readonly number[], end: number): ArgSpan[] {
  // Trivial empty case: single split at the opening paren with no content.
  if (splits.length === 1) {
    const only = splits[0];
    if (only === undefined) {
      return [];
    }
    const trimmedStart = skipWhitespace(code, only, end);
    if (trimmedStart === end) {
      return [];
    }
  }
  const spans: ArgSpan[] = [];
  for (let i = 0; i < splits.length; i++) {
    const span = makeSingleSpan(code, splits, i, end);
    if (span) {
      spans.push(span);
    }
  }
  return spans;
}

function makeSingleSpan(
  code: string,
  splits: readonly number[],
  i: number,
  end: number
): ArgSpan | null {
  const rawStart = splits[i];
  if (rawStart === undefined) {
    return null;
  }
  const next = splits[i + 1];
  const rawEnd = next === undefined ? end : next - 1; // exclude the comma
  const trimmedStart = skipWhitespace(code, rawStart, rawEnd);
  const trimmedEnd = trimRightWhitespace(code, trimmedStart, rawEnd);
  return {
    start: trimmedStart,
    end: trimmedEnd,
    text: code.slice(trimmedStart, trimmedEnd),
  };
}

function skipWhitespace(code: string, start: number, limit: number): number {
  let i = start;
  while (i < limit) {
    const c = code[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    if (c === '/' && code[i + 1] === '/') {
      i = skipLineComment(code, i);
      continue;
    }
    if (c === '/' && code[i + 1] === '*') {
      i = skipBlockComment(code, i);
      continue;
    }
    break;
  }
  return i;
}

function trimRightWhitespace(code: string, start: number, end: number): number {
  let i = end;
  while (i > start) {
    const c = code[i - 1];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i--;
      continue;
    }
    break;
  }
  return i;
}

function skipStringLiteral(code: string, start: number): number {
  const quote = code[start];
  let i = start + 1;
  while (i < code.length) {
    if (code[i] === '\\') {
      i += 2;
      continue;
    }
    if (code[i] === quote) {
      return i + 1;
    }
    if (code[i] === '\n') {
      return i + 1;
    }
    i++;
  }
  return i;
}

function skipTemplateLiteral(code: string, start: number): number {
  let i = start + 1;
  while (i < code.length) {
    if (code[i] === '\\') {
      i += 2;
      continue;
    }
    if (code[i] === '`') {
      return i + 1;
    }
    if (code[i] === '$' && code[i + 1] === '{') {
      i = skipTemplateInterpolation(code, i + 2);
      continue;
    }
    i++;
  }
  return i;
}

/**
 * Skip a `${...}` body inside a template literal, returning the position
 * just after the matching `}`. Handles nested strings, templates, and braces.
 */
function skipTemplateInterpolation(code: string, start: number): number {
  let i = start;
  let depth = 1;
  while (i < code.length && depth > 0) {
    const c = code[i];
    if (c === '"' || c === "'") {
      i = skipStringLiteral(code, i);
      continue;
    }
    if (c === '`') {
      i = skipTemplateLiteral(code, i);
      continue;
    }
    if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
    }
    i++;
  }
  return i;
}

/**
 * Build the edit for a `t(...)` call. Three shapes are supported:
 *   - `t('key')`           → append `, { __cs: '…' }`
 *   - `t('key', { … })`    → splice `__cs: '…',` inside the object literal
 *   - `t('key', existing)` → skipped (would need runtime merging)
 *   - `t(\`key\`, …)`      → treated like the string forms
 */
function buildTEdit(
  code: string,
  args: Arguments,
  line: number,
  relPath: string
): Edit | null {
  if (args.spans.length === 0) {
    return null;
  }
  const first = args.spans[0];
  if (!first || !isStringOrTemplateLiteral(first.text)) {
    return null;
  }
  const meta = `${relPath}:${line}`;
  if (args.spans.length === 1) {
    return {
      at: args.closeParen,
      remove: 0,
      insert: `, { __cs: ${JSON.stringify(meta)} }`,
    };
  }
  const second = args.spans[1];
  if (!second || !isObjectLiteral(second.text)) {
    return null;
  }
  return buildObjectSpliceEdit(code, second, meta);
}

/**
 * Splice `__cs: '…'` into an existing object-literal options arg. Insert
 * just after the opening `{` so we don't disturb the user's formatting.
 */
function buildObjectSpliceEdit(code: string, span: ArgSpan, meta: string): Edit | null {
  const objOpen = code.indexOf('{', span.start);
  if (objOpen === -1 || objOpen >= span.end) {
    return null;
  }
  const insideStart = objOpen + 1;
  const firstNonWs = skipWhitespace(code, insideStart, span.end);
  const closingBrace = code.lastIndexOf('}', span.end - 1);
  const isEmpty = firstNonWs === closingBrace;
  const insert = isEmpty
    ? ` __cs: ${JSON.stringify(meta)} `
    : ` __cs: ${JSON.stringify(meta)},`;
  return { at: insideStart, remove: 0, insert };
}

/**
 * Build the edit for a `tp(...)` call:
 *   - `tp('pkg', 'key')`            → `tp('pkg', 'key', undefined, '<cs>')`
 *   - `tp('pkg', 'key', 'def')`     → `tp('pkg', 'key', 'def', '<cs>')`
 *   - `tp('pkg', 'key', d, '<cs>')` → leave alone (already has 4 args)
 *
 * The first arg must be a literal (so we recognise this as a real tp call,
 * not a `tp` variable that happens to be callable); the second must also
 * be a literal to keep the call shape valid. If either is dynamic, skip.
 */
function buildTpEdit(args: Arguments, line: number, relPath: string): Edit | null {
  if (args.spans.length < 2 || args.spans.length > 3) {
    return null;
  }
  const meta = `${relPath}:${line}`;
  const last = args.spans.at(-1);
  if (!last) {
    return null;
  }
  if (args.spans.length === 2) {
    return {
      at: last.end,
      remove: 0,
      insert: `, undefined, ${JSON.stringify(meta)}`,
    };
  }
  return {
    at: last.end,
    remove: 0,
    insert: `, ${JSON.stringify(meta)}`,
  };
}

function isStringOrTemplateLiteral(text: string): boolean {
  if (text.length < 2) {
    return false;
  }
  const first = text[0];
  const last = text.at(-1);
  if (first === '"' && last === '"') {
    return true;
  }
  if (first === "'" && last === "'") {
    return true;
  }
  if (first === '`' && last === '`') {
    return true;
  }
  return false;
}

function isObjectLiteral(text: string): boolean {
  // Anything starting with `{` after whitespace is an object literal in
  // expression position — TypeScript `as const` / `satisfies T` suffixes
  // attach to the right side and don't disturb the `{` opening, so a
  // prefix-trim check is enough.
  return text.trimStart().startsWith('{');
}
