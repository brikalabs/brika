/**
 * Shared action-file analysis, used by both the isolate stubber (isolate.ts, so
 * the gate does not compile server-action subtrees as browser code) and the
 * report (report.ts). Pure JS, edge-safe.
 *
 * A file is an action file iff, after type-stripping, it still *value*-imports
 * `@brika/sdk/actions`. Export names are read from sucrase's CJS output, where a
 * local export lowers to `exports.<name> =` and a re-export (`export { x } from
 * '...'`) lowers to `_createNamedExportFrom(obj, '<name>', ...)`. This is
 * best-effort without a full parser: it matches sucrase/Bun on const/let/var/
 * function/class/`{ }`/default/re-export forms; the only residual gap is a literal
 * `exports.x=` inside a string, which real action files do not contain.
 */
import { transform } from 'sucrase';

const ACTION_REQUIRE = /require\(\s*["']@brika\/sdk\/actions["']\s*\)/;
const EXPORT_ASSIGN =
  /exports\.\s*([A-Za-z_$][\w$]*)\s*=|_createNamedExportFrom\([^,]+,\s*["']([A-Za-z_$][\w$]*)["']/g;

/** Strip line + block comments so a `// exports.x=` note is not read as an export. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Exported names of `code` if it is an action file, or `null` if it is not one
 * (no value import of `@brika/sdk/actions`) or does not transpile. Never throws.
 */
export function actionExports(code: string, jsx: boolean): string[] | null {
  let cjs: string;
  try {
    cjs = transform(code, {
      transforms: jsx ? ['typescript', 'jsx', 'imports'] : ['typescript', 'imports'],
    }).code;
  } catch {
    return null; // unparseable here; the bundler surfaces real syntax errors
  }
  if (!ACTION_REQUIRE.test(cjs)) {
    return null; // type-only import was stripped, or not an action file at all
  }
  const names = new Set<string>();
  for (const m of stripComments(cjs).matchAll(EXPORT_ASSIGN)) {
    const name = m[1] ?? m[2];
    if (name !== undefined && name !== '__esModule') {
      names.add(name);
    }
  }
  return [...names];
}
