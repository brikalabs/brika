import { type ArgSpan, type Arguments, readArguments, skipWhitespace } from './arguments';
import type { CallStart, Edit } from './scanner';

/**
 * Once the scanner has located a `t(` / `tp(` call, walk its arguments and
 * decide what to inject. Returns `null` for shapes we can't safely rewrite
 * (variable options bag, non-literal first arg, etc.).
 */
export function buildEdit(code: string, call: CallStart, relPath: string): Edit | null {
  const args = readArguments(code, call.openParen);
  if (!args) {
    return null;
  }
  if (call.name === 't') {
    return buildTEdit(code, args, call.line, relPath);
  }
  return buildTpEdit(args, call.line, relPath);
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
 * Both the package and key args must be literals — otherwise this is a
 * `tp` variable that happens to be callable, or a dynamic key/package
 * lookup we can't safely annotate.
 */
function buildTpEdit(args: Arguments, line: number, relPath: string): Edit | null {
  if (args.spans.length < 2 || args.spans.length > 3) {
    return null;
  }
  const pkg = args.spans[0];
  const key = args.spans[1];
  if (!pkg || !isStringOrTemplateLiteral(pkg.text)) {
    return null;
  }
  if (!key || !isStringOrTemplateLiteral(key.text)) {
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
  return text.trimStart().startsWith('{');
}
