import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  materializeEmbeddedCli,
  runEmbeddedBuild,
  runMaterializedCli,
  shouldDelegateToEmbeddedCli,
} from './embedded-cli';

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'brika-embedded-cli-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe('shouldDelegateToEmbeddedCli', () => {
  test('false when running from source', () => {
    expect(shouldDelegateToEmbeddedCli()).toBe(false);
  });
});

describe('materializeEmbeddedCli', () => {
  test('writes the source to a content-addressed file under runtime/', async () => {
    const source = 'process.exit(0);';
    const path = await materializeEmbeddedCli(source, dataDir);
    expect(path).toStartWith(join(dataDir, 'runtime', 'brika-cli-'));
    expect(path).toEndWith('.js');
    expect(await Bun.file(path).text()).toBe(source);
  });

  test('written once: a second call reuses the existing file', async () => {
    const source = 'process.exit(1);';
    const first = await materializeEmbeddedCli(source, dataDir);
    const before = await stat(first);
    const second = await materializeEmbeddedCli(source, dataDir);
    expect(second).toBe(first);
    expect((await stat(second)).mtimeMs).toBe(before.mtimeMs);
  });
});

describe('runMaterializedCli', () => {
  test('runs the CLI as a plain-bun child and reports its exit code', async () => {
    const cliPath = join(dataDir, 'stub-cli.js');
    await Bun.write(
      cliPath,
      'process.exit(process.env.BUN_BE_BUN === "1" && process.argv[2] === "build" ? 0 : 9);'
    );
    expect(await runMaterializedCli(cliPath, ['build'], dataDir)).toBe(0);
    expect(await runMaterializedCli(cliPath, ['not-build'], dataDir)).toBe(9);
  });
});

describe('runEmbeddedBuild', () => {
  let previousHome: string | undefined;

  beforeEach(() => {
    previousHome = process.env.BRIKA_HOME;
    process.env.BRIKA_HOME = dataDir;
  });

  afterEach(() => {
    if (previousHome === undefined) {
      delete process.env.BRIKA_HOME;
    } else {
      process.env.BRIKA_HOME = previousHome;
    }
  });

  test('materializes the loaded source and forwards build args', async () => {
    const stub =
      'const args = process.argv.slice(2);\n' +
      'process.exit(args[0] === "build" && args[1] === "--dir" && !args.includes("--check") ? 0 : 5);';
    expect(await runEmbeddedBuild(dataDir, false, async () => stub)).toBe(true);
  });

  test('forwards --check and reflects a failing child', async () => {
    const stub = 'process.exit(process.argv.includes("--check") ? 5 : 0);';
    expect(await runEmbeddedBuild(dataDir, true, async () => stub)).toBe(false);
  });
});
