import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveLogsToFile } from './saveLog';

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'mortar-savelog-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('saveLogsToFile', () => {
  test('writes the .mortar-logs/<id>-<stamp>.log file and returns its path', async () => {
    const path = await saveLogsToFile('hub', ['hello', 'world'], workDir);
    expect(path).toContain(join(workDir, '.mortar-logs', 'hub-'));
    expect(path.endsWith('.log')).toBe(true);
    const text = await readFile(path, 'utf8');
    expect(text).toBe('hello\nworld\n');
  });

  test('creates the parent directory if missing', async () => {
    const path = await saveLogsToFile('svc', ['line'], workDir);
    const dir = join(workDir, '.mortar-logs');
    const entries = await readdir(dir);
    const filename = path.split('/').pop() ?? '';
    expect(entries).toContain(filename);
  });

  test('strips ANSI escape codes', async () => {
    const ESC = String.fromCodePoint(0x1b);
    const lines = [`${ESC}[31mred${ESC}[0m`, 'plain'];
    const path = await saveLogsToFile('svc', lines, workDir);
    const text = await readFile(path, 'utf8');
    expect(text).toBe('red\nplain\n');
  });

  test('handles empty log array', async () => {
    const path = await saveLogsToFile('empty', [], workDir);
    const text = await readFile(path, 'utf8');
    expect(text).toBe('\n');
  });
});
