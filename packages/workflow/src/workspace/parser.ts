/**
 * Workspace Parser
 *
 * Parse and validate TOML workspace files.
 */

import TOML from '@iarna/toml';
import type { Workflow } from '../types';
import { WorkspaceSchema } from './schema';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ParseResult = { ok: true; workflow: Workflow } | { ok: false; error: string };

// ─────────────────────────────────────────────────────────────────────────────
// Parser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a TOML string into a validated Workflow.
 *
 * @param toml - TOML content as string
 * @returns Parsed workflow or error
 */
export function parseWorkspace(toml: string): ParseResult {
  try {
    // Parse TOML using Bun's built-in TOML support
    const raw = parseTOML(toml);

    // Validate with Zod schema
    const result = WorkspaceSchema.safeParse(raw);

    if (!result.success) {
      const errors = result.error.issues
        .map((issue) => {
          const path = issue.path.join('.');
          return path ? `${path}: ${issue.message}` : issue.message;
        })
        .join('; ');
      return { ok: false, error: `Validation failed: ${errors}` };
    }

    return { ok: true, workflow: result.data as Workflow };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Parse error: ${message}` };
  }
}

/**
 * Parse TOML string to object.
 * Uses @iarna/toml for parsing.
 */
function parseTOML(toml: string): unknown {
  return TOML.parse(toml);
}

/**
 * Parse a TOML file into a validated Workflow.
 *
 * @param filePath - Path to TOML file
 * @returns Parsed workflow or error
 */
export async function parseWorkspaceFile(filePath: string): Promise<ParseResult> {
  try {
    const file = Bun.file(filePath);
    const content = await file.text();
    return parseWorkspace(content);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `File read error: ${message}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Serialize a Workflow to TOML string.
 *
 * @param workflow - Workflow to serialize
 * @returns TOML string
 */
export function serializeWorkspace(workflow: Workflow): string {
  // biome-ignore lint/suspicious/noExplicitAny: TOML stringify needs any
  return TOML.stringify(workflow as any);
}
