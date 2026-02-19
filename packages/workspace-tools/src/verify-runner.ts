/**
 * Runs brika-verify-plugin as a subprocess and parses its output.
 * Used by the publish flow to verify plugin packages before publishing.
 */

import { dirname } from 'node:path';
import { isObjectRecord } from './type-guards';
import type { WorkspacePackage } from './workspace';

export interface VerifyJsonPayload {
  errors: string[];
  warnings: string[];
}

export interface VerifyExecution {
  pkg: WorkspacePackage;
  exitCode: number;
  output: string;
  payload?: VerifyJsonPayload;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string') out.push(entry);
  }
  return out;
}

function parseVerifyJsonPayload(stdout: string): VerifyJsonPayload | undefined {
  try {
    const parsed = JSON.parse(stdout);
    if (!isObjectRecord(parsed)) return undefined;
    const errors = readStringArray(parsed.errors);
    const warnings = readStringArray(parsed.warnings);
    if (!errors || !warnings) return undefined;
    return { errors, warnings };
  } catch {
    return undefined;
  }
}

export function normalizeWarningMessage(message: string): string {
  let compact = message.replaceAll('\r', ' ').replaceAll('\n', ' ').replaceAll('\t', ' ').trim();
  while (compact.includes('  ')) {
    compact = compact.replaceAll('  ', ' ');
  }
  const updateIndex = compact.indexOf(' Update ');
  if (updateIndex > 0) {
    compact = compact.slice(0, updateIndex).trim();
  }

  if (compact.startsWith('keywords must include "brika"')) return 'keyword "brika" missing';
  if (compact.startsWith('keywords should include "brika-plugin"'))
    return 'keyword "brika-plugin" recommended';
  if (compact.startsWith('$schema field is missing')) return '$schema missing';
  if (compact.startsWith('$schema "') && compact.includes('does not point to schema.brika.dev'))
    return '$schema host must be schema.brika.dev';

  return compact;
}

async function runVerify(
  verifyScript: string,
  pluginDir: string,
  cwd: string,
  json = false
): Promise<{ exitCode: number; output: string; payload?: VerifyJsonPayload }> {
  const args = json ? ['bun', verifyScript, pluginDir, '--json'] : ['bun', verifyScript, pluginDir];
  const proc = Bun.spawn(args, { cwd, stdout: 'pipe', stderr: 'pipe' });
  const exitCode = await proc.exited;
  const stdout = (await new Response(proc.stdout).text()).trim();
  const stderr = (await new Response(proc.stderr).text()).trim();
  const output = [stdout, stderr]
    .filter((chunk) => chunk.length > 0)
    .join('\n')
    .trim();
  const payload = json ? parseVerifyJsonPayload(stdout) : undefined;
  return { exitCode, output, payload };
}

export function runVerifyForPackages(
  verifyScript: string,
  packages: WorkspacePackage[],
  cwd: string,
  json = false
): Promise<VerifyExecution[]> {
  return Promise.all(
    packages.map(async (pkg) => {
      const pluginDir = dirname(pkg.path);
      const result = await runVerify(verifyScript, pluginDir, cwd, json);
      return { pkg, ...result };
    })
  );
}

export function getPreviewWarnings(result: VerifyExecution): string[] | undefined {
  if (result.payload) {
    return [...result.payload.errors, ...result.payload.warnings].map(normalizeWarningMessage);
  }
  if (result.exitCode !== 0) {
    return ['plugin verification failed (could not parse output)'];
  }
  return undefined;
}
