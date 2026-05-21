export interface Arguments {
  /** Comma-separated argument spans (trimmed of leading/trailing whitespace). */
  readonly spans: ArgSpan[];
  /** Position of the matching `)`. */
  readonly closeParen: number;
}

export interface ArgSpan {
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
export function readArguments(code: string, openParen: number): Arguments | null {
  const cursor: ArgCursor = {
    pos: openParen,
    depth: 0,
    splits: [openParen],
  };
  while (cursor.pos < code.length) {
    const result = stepArgumentCursor(code, cursor);
    if (result.kind === 'done') {
      return {
        spans: makeSpans(code, cursor.splits, result.closeParen),
        closeParen: result.closeParen,
      };
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

export function skipWhitespace(code: string, start: number, limit: number): number {
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
