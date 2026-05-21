import { buildEdit } from './edits';
import {
  CH_BACKTICK,
  CH_CR,
  CH_DQUOTE,
  CH_LBRACE,
  CH_LF,
  CH_LPAREN,
  CH_RBRACE,
  CH_SLASH,
  CH_SPACE,
  CH_SQUOTE,
  CH_TAB,
  DIVISION_PRECEDING,
  isIdentPart,
  isIdentStart,
  REGEX_PRECEDING_KEYWORDS,
} from './index';

export interface Edit {
  readonly at: number;
  readonly remove: number;
  readonly insert: string;
}

export interface CallStart {
  readonly name: 't' | 'tp';
  readonly identStart: number;
  readonly openParen: number;
  readonly line: number;
}

/**
 * Walk the source text with a tiny tokenizer that understands string and
 * template literals, comments, and regex literals, and rewrite `t(...)` /
 * `tp(...)` calls in place. Returns the original `code` when no call is
 * eligible for injection.
 */
export function injectCallSites(code: string, relPath: string): string {
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

/**
 * Tokenizer-driven walker. Tracks the surrounding lexical context so we can
 * tell a real call from one buried in a string / comment / regex / template.
 *
 * Template literals are nestable (`` `outer ${ `inner ${x}` } ` ``), so the
 * scanner pushes/pops a template stack to know which closing brace returns
 * us to the surrounding template.
 *
 * The skip routines here (`skipString`, `skipTemplate`, `tryComment`) are
 * deliberately not shared with the standalone helpers in `arguments.ts`:
 * the scanner needs to maintain a 1-based line counter and template-nesting
 * state across spans, while the argument walker only ever runs between a
 * single call's parentheses and doesn't need either.
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
        this.templateStack.pop();
        this.advance();
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
    const ident = this.readIdentifier();
    if ((ident === 't' || ident === 'tp') && this.canBeCall(start)) {
      const openParen = this.findOpenParen();
      if (openParen !== -1) {
        return { name: ident, identStart: start, openParen, line: this.line };
      }
    }
    this.recordSignificant(ident);
    return null;
  }

  /** True if the identifier we just read could legally start a call. */
  private canBeCall(identStart: number): boolean {
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

  private codeAt(index: number): number {
    return this.src.codePointAt(index) ?? -1;
  }
}
