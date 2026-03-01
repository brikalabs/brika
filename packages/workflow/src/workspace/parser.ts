/**
 * Workspace Parser
 *
 * Parse and validate YAML workspace files.
 */

import { parse, stringify } from 'yaml';
import type { Workflow } from '../types';
import { WorkspaceSchema } from './schema';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ParseResult =
  | {
      ok: true;
      workflow: Workflow;
    }
  | {
      ok: false;
      error: string;
    };

// ─────────────────────────────────────────────────────────────────────────────
// Parser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a YAML string into a validated Workflow.
 *
 * @param yamlContent - YAML content as string
 * @returns Parsed workflow or error
 */
export function parseWorkspace(yamlContent: string): ParseResult {
  try {
    // Parse YAML
    const raw = parseYAML(yamlContent);

    // Validate with Zod schema
    const result = WorkspaceSchema.safeParse(raw);

    if (!result.success) {
      const errors = result.error.issues
        .map((issue) => {
          const path = issue.path.join('.');
          return path ? `${path}: ${issue.message}` : issue.message;
        })
        .join('; ');
      return {
        ok: false,
        error: `Validation failed: ${errors}`,
      };
    }

    return {
      ok: true,
      workflow: result.data as Workflow,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `Parse error: ${message}`,
    };
  }
}

/**
 * Parse YAML string to object.
 * Uses the yaml package for parsing.
 */
function parseYAML(yamlContent: string): unknown {
  return parse(yamlContent);
}

/**
 * Parse a YAML file into a validated Workflow.
 *
 * @param filePath - Path to YAML file
 * @returns Parsed workflow or error
 */
export async function parseWorkspaceFile(filePath: string): Promise<ParseResult> {
  try {
    const file = Bun.file(filePath);
    const content = await file.text();
    return parseWorkspace(content);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `File read error: ${message}`,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Serialize a Workflow to YAML string.
 *
 * @param workflow - Workflow to serialize
 * @returns YAML string
 */
export function serializeWorkspace(workflow: Workflow): string {
  return stringify(workflow, {
    indent: 2,
    lineWidth: 0,
    defaultKeyType: 'PLAIN',
    defaultStringType: 'PLAIN',
  });
}
