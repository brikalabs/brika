import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { arch, dirs, files } from '../dsl';
import { runArch } from '../runner';

const BENCH_DIR = join(import.meta.dir, '.bench-fixtures');

async function generateFiles(count: number, linesPerFile: number) {
  await mkdir(BENCH_DIR, {
    recursive: true,
  });

  const content = Array(linesPerFile).fill('const x = 1;').join('\n');

  await Promise.all(
    Array.from(
      {
        length: count,
      },
      async (_, i) => {
        const dir = join(BENCH_DIR, `feature${i}`);
        await mkdir(dir, {
          recursive: true,
        });
        await writeFile(join(dir, 'index.ts'), content);
        await writeFile(join(dir, 'hooks.ts'), `export function useFeature${i}() {}`);
        await writeFile(join(dir, `Component${i}.tsx`), content);
      }
    )
  );
}

describe('benchmarks', () => {
  beforeAll(async () => {
    await generateFiles(50, 100);
  });

  afterAll(async () => {
    await rm(BENCH_DIR, {
      recursive: true,
      force: true,
    });
  });

  it('benchmark: 50 features, naming check', async () => {
    const rules = arch(files('**/*.tsx').should().bePascalCase());

    const start = performance.now();
    const result = await runArch({
      rules,
      cwd: BENCH_DIR,
    });
    const elapsed = performance.now() - start;

    console.log(`  Naming check: ${elapsed.toFixed(2)}ms for ${result.filesScanned} files`);
    expect(result.passed).toBe(true);
    expect(elapsed).toBeLessThan(1000); // Should complete in under 1s
  });

  it('benchmark: 50 features, max lines check', async () => {
    const rules = arch(files('**/*.ts').should().haveMaxLines(200));

    const start = performance.now();
    const result = await runArch({
      rules,
      cwd: BENCH_DIR,
    });
    const elapsed = performance.now() - start;

    console.log(`  Max lines check: ${elapsed.toFixed(2)}ms for ${result.filesScanned} files`);
    expect(result.passed).toBe(true);
    expect(elapsed).toBeLessThan(1000);
  });

  it('benchmark: 50 features, directory structure check', async () => {
    const rules = arch(dirs('feature*/').should().containFiles('index.ts', 'hooks.ts'));

    const start = performance.now();
    const result = await runArch({
      rules,
      cwd: BENCH_DIR,
    });
    const elapsed = performance.now() - start;

    console.log(`  Dir structure check: ${elapsed.toFixed(2)}ms for ${result.filesScanned} dirs`);
    expect(result.passed).toBe(true);
    expect(elapsed).toBeLessThan(1000);
  });

  it('benchmark: combined rules', async () => {
    const rules = arch(
      files('**/*.tsx').should().bePascalCase(),
      files('**/*.ts').should().haveMaxLines(200),
      files('**/hooks.ts')
        .should()
        .haveExportsMatching(/^use[A-Z]/, 'use prefix'),
      dirs('feature*/').should().containFiles('index.ts', 'hooks.ts')
    );

    const start = performance.now();
    const result = await runArch({
      rules,
      cwd: BENCH_DIR,
    });
    const elapsed = performance.now() - start;

    console.log(`  Combined (4 rules): ${elapsed.toFixed(2)}ms for ${result.filesScanned} files`);
    expect(result.passed).toBe(true);
    expect(elapsed).toBeLessThan(2000);
  });
});
