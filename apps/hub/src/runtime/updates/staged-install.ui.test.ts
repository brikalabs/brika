/**
 * Staged-install UI-bundle commit tests. The base
 * `staged-install.test.ts` exercises binary-only commits; this file
 * picks up the `ui.next → ui → ui.previous` branch.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  commitStagedArtifacts,
  liveBinaryPath,
  nextBinaryPath,
  previousBinaryPath,
} from './staged-install';

let installDir: string;

beforeEach(() => {
  installDir = mkdtempSync(join(tmpdir(), 'brika-stage-ui-'));
});

afterEach(() => {
  rmSync(installDir, { recursive: true, force: true });
});

describe('commitStagedArtifacts — ui bundle paths', () => {
  test('moves live ui → ui.previous and ui.next → ui when both exist', () => {
    writeFileSync(liveBinaryPath(installDir), 'old-bin');
    writeFileSync(nextBinaryPath(installDir), 'new-bin');
    mkdirSync(join(installDir, 'ui'), { recursive: true });
    writeFileSync(join(installDir, 'ui', 'index.html'), 'old-ui');
    mkdirSync(join(installDir, 'ui.next'), { recursive: true });
    writeFileSync(join(installDir, 'ui.next', 'index.html'), 'new-ui');

    commitStagedArtifacts(installDir);

    expect(readFileSync(join(installDir, 'ui', 'index.html'), 'utf8')).toBe('new-ui');
    expect(readFileSync(join(installDir, 'ui.previous', 'index.html'), 'utf8')).toBe('old-ui');
    expect(existsSync(join(installDir, 'ui.next'))).toBe(false);
  });

  test('promotes ui.next → ui even when no live ui exists yet', () => {
    writeFileSync(liveBinaryPath(installDir), 'old-bin');
    writeFileSync(nextBinaryPath(installDir), 'new-bin');
    mkdirSync(join(installDir, 'ui.next'), { recursive: true });
    writeFileSync(join(installDir, 'ui.next', 'index.html'), 'fresh-ui');

    commitStagedArtifacts(installDir);

    expect(readFileSync(join(installDir, 'ui', 'index.html'), 'utf8')).toBe('fresh-ui');
    // No old ui → no ui.previous either.
    expect(existsSync(join(installDir, 'ui.previous'))).toBe(false);
    // Binary swap still happens.
    expect(readFileSync(liveBinaryPath(installDir), 'utf8')).toBe('new-bin');
    expect(readFileSync(previousBinaryPath(installDir), 'utf8')).toBe('old-bin');
  });

  test('clears a stale ui.previous from an earlier upgrade before promoting', () => {
    writeFileSync(liveBinaryPath(installDir), 'b');
    writeFileSync(nextBinaryPath(installDir), 'b2');
    mkdirSync(join(installDir, 'ui'), { recursive: true });
    writeFileSync(join(installDir, 'ui', 'a.html'), 'live');
    mkdirSync(join(installDir, 'ui.previous'), { recursive: true });
    writeFileSync(join(installDir, 'ui.previous', 'stale.html'), 'stale-from-last-upgrade');
    mkdirSync(join(installDir, 'ui.next'), { recursive: true });
    writeFileSync(join(installDir, 'ui.next', 'b.html'), 'fresh');

    commitStagedArtifacts(installDir);

    // ui.previous now reflects the just-superseded live, not the stale shape.
    expect(existsSync(join(installDir, 'ui.previous', 'stale.html'))).toBe(false);
    expect(readFileSync(join(installDir, 'ui.previous', 'a.html'), 'utf8')).toBe('live');
    expect(readFileSync(join(installDir, 'ui', 'b.html'), 'utf8')).toBe('fresh');
  });
});
