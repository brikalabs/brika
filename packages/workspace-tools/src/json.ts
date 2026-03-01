import { applyEdits, modify } from 'jsonc-parser';

type JsonObject = Record<string, unknown>;
type JsonObjectPatch = Partial<JsonObject>;

/**
 * Updates a single JSON path while preserving existing style.
 */
export function updateJsonField(
  content: string,
  path: Array<string | number>,
  value: unknown
): string {
  const edits = modify(content, path, value, {});
  return applyEdits(content, edits);
}

/**
 * Applies a top-level JSON object patch (partial object), preserving style.
 */
export function updateJsonObject(content: string, patch: JsonObjectPatch): string {
  let updated = content;
  for (const [key, value] of Object.entries(patch)) {
    updated = updateJsonField(
      updated,
      [
        key,
      ],
      value
    );
  }
  return updated;
}
