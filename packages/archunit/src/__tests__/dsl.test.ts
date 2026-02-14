import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { arch, dirs, files } from '../dsl';
import { runArch } from '../runner';
import type { Rule } from '../types';

const TEST_DIR = join(import.meta.dir, '.test-fixtures');

async function setupFixtures(fixtures: Record<string, string>) {
  await mkdir(TEST_DIR, { recursive: true });
  for (const [path, content] of Object.entries(fixtures)) {
    const fullPath = join(TEST_DIR, path);
    await mkdir(join(fullPath, '..'), { recursive: true });
    await writeFile(fullPath, content);
  }
}

function runRules(rules: Rule[]) {
  return runArch({ rules, cwd: TEST_DIR });
}

describe('files()', () => {
  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('naming conventions', () => {
    it('bePascalCase - passes for PascalCase files', async () => {
      await setupFixtures({ 'MyComponent.tsx': '' });
      const rules = arch(files('*.tsx').should().bePascalCase());
      const result = await runRules(rules);
      expect(result.passed).toBe(true);
    });

    it('bePascalCase - fails for non-PascalCase files', async () => {
      await setupFixtures({ 'myComponent.tsx': '' });
      const rules = arch(files('*.tsx').should().bePascalCase());
      const result = await runRules(rules);
      expect(result.passed).toBe(false);
      expect(result.violations[0]!.violations[0]!.message).toContain('not PascalCase');
    });

    it('beCamelCase - passes for camelCase files', async () => {
      await setupFixtures({ 'myService.ts': '' });
      const rules = arch(files('*.ts').should().beCamelCase());
      const result = await runRules(rules);
      expect(result.passed).toBe(true);
    });

    it('beCamelCase - fails for non-camelCase files', async () => {
      await setupFixtures({ 'MyService.ts': '' });
      const rules = arch(files('*.ts').should().beCamelCase());
      const result = await runRules(rules);
      expect(result.passed).toBe(false);
    });

    it('beKebabCase - passes for kebab-case files', async () => {
      await setupFixtures({ 'my-utils.ts': '' });
      const rules = arch(files('*.ts').should().beKebabCase());
      const result = await runRules(rules);
      expect(result.passed).toBe(true);
    });

    it('beKebabCase - fails for non-kebab-case files', async () => {
      await setupFixtures({ 'myUtils.ts': '' });
      const rules = arch(files('*.ts').should().beKebabCase());
      const result = await runRules(rules);
      expect(result.passed).toBe(false);
    });
  });

  describe('haveMaxLines', () => {
    it('passes when file has fewer lines than max', async () => {
      await setupFixtures({ 'small.ts': 'line1\nline2\nline3' });
      const rules = arch(files('*.ts').should().haveMaxLines(10));
      const result = await runRules(rules);
      expect(result.passed).toBe(true);
    });

    it('fails when file exceeds max lines', async () => {
      await setupFixtures({ 'large.ts': 'a\nb\nc\nd\ne\nf' });
      const rules = arch(files('*.ts').should().haveMaxLines(3));
      const result = await runRules(rules);
      expect(result.passed).toBe(false);
      expect(result.violations[0]!.violations[0]!.message).toContain('6 lines (max 3)');
    });
  });

  describe('contain / notContain', () => {
    it('contain - passes when pattern found', async () => {
      await setupFixtures({ 'file.ts': 'export const foo = 1;' });
      const rules = arch(
        files('*.ts')
          .should()
          .contain(/export const/)
      );
      const result = await runRules(rules);
      expect(result.passed).toBe(true);
    });

    it('contain - fails when pattern not found', async () => {
      await setupFixtures({ 'file.ts': 'const foo = 1;' });
      const rules = arch(
        files('*.ts')
          .should()
          .contain(/export const/, 'export')
      );
      const result = await runRules(rules);
      expect(result.passed).toBe(false);
      expect(result.violations[0]!.violations[0]!.message).toContain('Missing export');
    });

    it('notContain - passes when pattern not found', async () => {
      await setupFixtures({ 'file.ts': 'logger.info("test")' });
      const rules = arch(
        files('*.ts')
          .should()
          .notContain(/console\.log/)
      );
      const result = await runRules(rules);
      expect(result.passed).toBe(true);
    });

    it('notContain - fails when pattern found', async () => {
      await setupFixtures({ 'file.ts': 'console.log("debug")' });
      const rules = arch(
        files('*.ts')
          .should()
          .notContain(/console\.log/, 'console.log')
      );
      const result = await runRules(rules);
      expect(result.passed).toBe(false);
      expect(result.violations[0]!.violations[0]!.message).toContain('Found console.log');
    });
  });

  describe('notImportFrom', () => {
    it('passes when no forbidden imports', async () => {
      await setupFixtures({ 'file.ts': "import { foo } from './utils';" });
      const rules = arch(
        files('*.ts')
          .should()
          .notImportFrom(/lodash/)
      );
      const result = await runRules(rules);
      expect(result.passed).toBe(true);
    });

    it('fails when forbidden import found', async () => {
      await setupFixtures({ 'file.ts': "import _ from 'lodash';" });
      const rules = arch(
        files('*.ts')
          .should()
          .notImportFrom(/lodash/)
      );
      const result = await runRules(rules);
      expect(result.passed).toBe(false);
      expect(result.violations[0]!.violations[0]!.message).toContain('Forbidden import');
    });
  });

  describe('onlyImportFrom', () => {
    it('passes when all imports match allowed pattern', async () => {
      await setupFixtures({
        'file.ts': "import { foo } from './utils';\nimport { bar } from './helpers';",
      });
      const rules = arch(files('*.ts').should().onlyImportFrom(/^\.\//));
      const result = await runRules(rules);
      expect(result.passed).toBe(true);
    });

    it('fails when an import does not match allowed pattern', async () => {
      await setupFixtures({
        'file.ts': "import { foo } from './utils';\nimport _ from 'lodash';",
      });
      const rules = arch(files('*.ts').should().onlyImportFrom(/^\.\//));
      const result = await runRules(rules);
      expect(result.passed).toBe(false);
      expect(result.violations[0]!.violations[0]!.message).toContain('Import not allowed');
      expect(result.violations[0]!.violations[0]!.message).toContain('lodash');
    });

    it('passes when no imports exist', async () => {
      await setupFixtures({
        'file.ts': 'const x = 1;',
      });
      const rules = arch(files('*.ts').should().onlyImportFrom(/^\.\//));
      const result = await runRules(rules);
      expect(result.passed).toBe(true);
    });

    it('uses custom description when provided', async () => {
      await setupFixtures({
        'file.ts': "import _ from 'lodash';",
      });
      const rules = arch(
        files('*.ts')
          .should()
          .onlyImportFrom(/^@brika\//, 'internal packages')
      );
      const result = await runRules(rules);
      expect(result.passed).toBe(false);
      expect(result.violations[0]!.violations[0]!.line).toBeGreaterThan(0);
    });
  });

  describe('haveExportsMatching', () => {
    it('passes when exports match pattern', async () => {
      await setupFixtures({
        'hooks.ts': 'export function useCounter() {}\nexport const useState = () => {}',
      });
      const rules = arch(
        files('hooks.ts')
          .should()
          .haveExportsMatching(/^use[A-Z]/)
      );
      const result = await runRules(rules);
      expect(result.passed).toBe(true);
    });

    it('fails when export does not match pattern', async () => {
      await setupFixtures({ 'hooks.ts': 'export function getCounter() {}' });
      const rules = arch(
        files('hooks.ts')
          .should()
          .haveExportsMatching(/^use[A-Z]/, 'use prefix')
      );
      const result = await runRules(rules);
      expect(result.passed).toBe(false);
      expect(result.violations[0]!.violations[0]!.message).toContain("doesn't match");
    });
  });
});

describe('class decorators', () => {
  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('haveClassDecorator', () => {
    it('passes when class has decorator', async () => {
      await setupFixtures({
        'service.ts': `
@singleton()
export class MyService {}
`,
      });
      const rules = arch(files('*.ts').should().haveClassDecorator('@singleton'));
      const result = await runRules(rules);
      expect(result.passed).toBe(true);
    });

    it('passes with decorator arguments', async () => {
      await setupFixtures({
        'service.ts': `
@singleton({ scope: 'request' })
class MyService {}
`,
      });
      const rules = arch(files('*.ts').should().haveClassDecorator('singleton'));
      const result = await runRules(rules);
      expect(result.passed).toBe(true);
    });

    it('fails when class missing decorator', async () => {
      await setupFixtures({ 'service.ts': 'export class MyService {}' });
      const rules = arch(files('*.ts').should().haveClassDecorator('@singleton'));
      const result = await runRules(rules);
      expect(result.passed).toBe(false);
      expect(result.violations[0]!.violations[0]!.message).toContain('missing @singleton()');
    });

    it('does not match method decorators', async () => {
      await setupFixtures({
        'service.ts': `
class MyService {
  @singleton()
  method() {}
}
`,
      });
      const rules = arch(files('*.ts').should().haveClassDecorator('@singleton'));
      const result = await runRules(rules);
      expect(result.passed).toBe(false);
    });
  });

  describe('haveMethodDecorator', () => {
    it('passes when method has decorator', async () => {
      await setupFixtures({
        'service.ts': `
class MyService {
  @log()
  handleRequest() {}
}
`,
      });
      const rules = arch(files('*.ts').should().haveMethodDecorator('@log'));
      const result = await runRules(rules);
      expect(result.passed).toBe(true);
    });

    it('passes with async method', async () => {
      await setupFixtures({
        'service.ts': `
class MyService {
  @cache({ ttl: 60 })
  async getData() {}
}
`,
      });
      const rules = arch(files('*.ts').should().haveMethodDecorator('cache'));
      const result = await runRules(rules);
      expect(result.passed).toBe(true);
    });

    it('fails when no method has decorator', async () => {
      await setupFixtures({
        'service.ts': `
class MyService {
  handleRequest() {}
}
`,
      });
      const rules = arch(files('*.ts').should().haveMethodDecorator('@log'));
      const result = await runRules(rules);
      expect(result.passed).toBe(false);
    });
  });

  describe('notHaveClassDecorator', () => {
    it('passes when class does not have decorator', async () => {
      await setupFixtures({ 'service.ts': 'export class MyService {}' });
      const rules = arch(files('*.ts').should().notHaveClassDecorator('@deprecated'));
      const result = await runRules(rules);
      expect(result.passed).toBe(true);
    });

    it('fails when class has forbidden decorator', async () => {
      await setupFixtures({
        'service.ts': `
@deprecated()
export class OldService {}
`,
      });
      const rules = arch(files('*.ts').should().notHaveClassDecorator('@deprecated'));
      const result = await runRules(rules);
      expect(result.passed).toBe(false);
    });
  });
});

describe('class structure', () => {
  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('exportClass', () => {
    it('passes when file exports a class', async () => {
      await setupFixtures({ 'service.ts': 'export class MyService {}' });
      const rules = arch(files('*.ts').should().exportClass());
      const result = await runRules(rules);
      expect(result.passed).toBe(true);
    });

    it('fails when file does not export a class', async () => {
      await setupFixtures({ 'utils.ts': 'export function helper() {}' });
      const rules = arch(files('*.ts').should().exportClass());
      const result = await runRules(rules);
      expect(result.passed).toBe(false);
    });
  });

  describe('exportFunction', () => {
    it('passes when file exports a function', async () => {
      await setupFixtures({ 'utils.ts': 'export function helper() {}' });
      const rules = arch(files('*.ts').should().exportFunction());
      const result = await runRules(rules);
      expect(result.passed).toBe(true);
    });

    it('passes with async function', async () => {
      await setupFixtures({ 'utils.ts': 'export async function fetchData() {}' });
      const rules = arch(files('*.ts').should().exportFunction());
      const result = await runRules(rules);
      expect(result.passed).toBe(true);
    });

    it('fails when file does not export a function', async () => {
      await setupFixtures({ 'types.ts': 'export type Foo = string;' });
      const rules = arch(files('*.ts').should().exportFunction());
      const result = await runRules(rules);
      expect(result.passed).toBe(false);
    });
  });

  describe('haveClassNamed', () => {
    it('passes when class name matches pattern', async () => {
      await setupFixtures({ 'service.ts': 'class UserService {}' });
      const rules = arch(
        files('*.ts')
          .should()
          .haveClassNamed(/Service$/)
      );
      const result = await runRules(rules);
      expect(result.passed).toBe(true);
    });

    it('fails when class name does not match', async () => {
      await setupFixtures({ 'handler.ts': 'class UserHandler {}' });
      const rules = arch(
        files('*.ts')
          .should()
          .haveClassNamed(/Service$/, 'ending with Service')
      );
      const result = await runRules(rules);
      expect(result.passed).toBe(false);
      expect(result.violations[0]!.violations[0]!.message).toContain("doesn't match");
    });

    it('fails when no class found', async () => {
      await setupFixtures({ 'utils.ts': 'export const foo = 1;' });
      const rules = arch(
        files('*.ts')
          .should()
          .haveClassNamed(/Service$/)
      );
      const result = await runRules(rules);
      expect(result.passed).toBe(false);
      expect(result.violations[0]!.violations[0]!.message).toContain('No class found');
    });
  });

  describe('extendClass', () => {
    it('passes when class extends base', async () => {
      await setupFixtures({ 'service.ts': 'class UserService extends BaseService {}' });
      const rules = arch(files('*.ts').should().extendClass('BaseService'));
      const result = await runRules(rules);
      expect(result.passed).toBe(true);
    });

    it('fails when class does not extend base', async () => {
      await setupFixtures({ 'service.ts': 'class UserService {}' });
      const rules = arch(files('*.ts').should().extendClass('BaseService'));
      const result = await runRules(rules);
      expect(result.passed).toBe(false);
    });
  });

  describe('implementInterface', () => {
    it('passes when class implements interface', async () => {
      await setupFixtures({ 'service.ts': 'class UserService implements Disposable {}' });
      const rules = arch(files('*.ts').should().implementInterface('Disposable'));
      const result = await runRules(rules);
      expect(result.passed).toBe(true);
    });

    it('passes with multiple interfaces', async () => {
      await setupFixtures({
        'service.ts': 'class UserService implements Serializable, Disposable {}',
      });
      const rules = arch(files('*.ts').should().implementInterface('Disposable'));
      const result = await runRules(rules);
      expect(result.passed).toBe(true);
    });

    it('fails when class does not implement interface', async () => {
      await setupFixtures({ 'service.ts': 'class UserService {}' });
      const rules = arch(files('*.ts').should().implementInterface('Disposable'));
      const result = await runRules(rules);
      expect(result.passed).toBe(false);
    });
  });
});

describe('dirs()', () => {
  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('containFiles', () => {
    it('passes when directory contains required files', async () => {
      await setupFixtures({
        'features/auth/index.ts': '',
        'features/auth/hooks.ts': '',
      });
      const rules = arch(dirs('features/*/').should().containFiles('index.ts', 'hooks.ts'));
      const result = await runRules(rules);
      expect(result.passed).toBe(true);
    });

    it('fails when directory missing required file', async () => {
      await setupFixtures({
        'features/auth/index.ts': '',
      });
      const rules = arch(dirs('features/*/').should().containFiles('index.ts', 'hooks.ts'));
      const result = await runRules(rules);
      expect(result.passed).toBe(false);
      expect(result.violations[0]!.violations[0]!.message).toContain('Missing "hooks.ts"');
    });
  });

  describe('containFile', () => {
    it('passes when directory contains the file', async () => {
      await setupFixtures({
        'features/auth/index.ts': '',
      });
      const rules = arch(dirs('features/*/').should().containFile('index.ts'));
      const result = await runRules(rules);
      expect(result.passed).toBe(true);
    });

    it('fails when directory missing the file', async () => {
      await setupFixtures({
        'features/auth/README.md': '',
      });
      const rules = arch(dirs('features/*/').should().containFile('index.ts'));
      const result = await runRules(rules);
      expect(result.passed).toBe(false);
      expect(result.violations[0]!.violations[0]!.message).toContain('Missing "index.ts"');
    });
  });

  describe('because() on DirRule', () => {
    it('includes reason in rule name', async () => {
      await setupFixtures({ 'features/auth/index.ts': '' });
      const rules = arch(
        dirs('features/*/').should().containFile('index.ts').because('Features need an entry point')
      );
      expect(rules[0]!.name).toContain('Features need an entry point');
    });
  });
});

describe('chaining with and()', () => {
  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('chains multiple checks together', async () => {
    await setupFixtures({
      'service.ts': `
@singleton()
export class MyService {
  getData() { return 42; }
}
`,
    });
    const rules = arch(
      files('*.ts')
        .should()
        .haveClassDecorator('@singleton')
        .and()
        .notContain(/console\.log/)
        .and()
        .exportClass()
    );
    const result = await runRules(rules);
    expect(result.passed).toBe(true);
  });

  it('fails if any chained check fails', async () => {
    await setupFixtures({
      'service.ts': `
@singleton()
export class MyService {
  debug() { console.log('test'); }
}
`,
    });
    const rules = arch(
      files('*.ts')
        .should()
        .haveClassDecorator('@singleton')
        .and()
        .notContain(/console\.log/, 'console.log')
    );
    const result = await runRules(rules);
    expect(result.passed).toBe(false);
  });
});

describe('because() reason', () => {
  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('includes reason in rule name', async () => {
    await setupFixtures({ 'myComponent.tsx': '' });
    const rules = arch(files('*.tsx').should().bePascalCase().because('Components use PascalCase'));
    expect(rules[0]!.name).toContain('Components use PascalCase');
  });
});

describe('skip()', () => {
  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('skips file rules when skip() is called', async () => {
    await setupFixtures({ 'myComponent.tsx': '' });
    const rules = arch(files('*.tsx').should().bePascalCase().skip());
    const result = await runRules(rules);
    expect(result.passed).toBe(true);
    expect(result.filesScanned).toBe(0);
  });

  it('skips dir rules when skip() is called', async () => {
    await setupFixtures({ 'features/auth/index.ts': '' });
    const rules = arch(dirs('features/*/').should().containFiles('index.ts', 'hooks.ts').skip());
    const result = await runRules(rules);
    expect(result.passed).toBe(true);
    expect(result.filesScanned).toBe(0);
  });
});

describe('defineConfig and printResult', () => {
  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('defineConfig returns the rules array', async () => {
    const { defineConfig } = await import('../runner');
    const rules = [files('*.ts').should().beCamelCase()];
    const config = defineConfig(rules);
    expect(config).toBe(rules);
  });

  it('printResult prints success message', async () => {
    const { printResult } = await import('../runner');
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    printResult({
      passed: true,
      violations: [],
      elapsed: 5.5,
      rulesChecked: 3,
      filesScanned: 10,
    });

    console.log = originalLog;
    expect(logs.some((l) => l.includes('All 3 rules passed'))).toBe(true);
  });

  it('printResult prints violations', async () => {
    const { printResult } = await import('../runner');
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    printResult({
      passed: false,
      violations: [
        {
          rule: 'test rule',
          violations: [{ file: 'test.ts', message: 'error', line: 10, suggestion: 'fix it' }],
        },
      ],
      elapsed: 5.5,
      rulesChecked: 1,
      filesScanned: 5,
    });

    console.log = originalLog;
    expect(logs.some((l) => l.includes('Architecture violations'))).toBe(true);
    expect(logs.some((l) => l.includes('test.ts'))).toBe(true);
    expect(logs.some((l) => l.includes(':10'))).toBe(true);
    expect(logs.some((l) => l.includes('fix it'))).toBe(true);
  });
});

describe('normalizeRules', () => {
  it('handles nested arrays', async () => {
    await setupFixtures({ 'test.ts': '' });
    const { runArch } = await import('../runner');

    const nestedRules = [
      [files('*.ts').should().beCamelCase()],
      files('*.ts').should().haveMaxLines(100),
    ];

    // runArch normalizes inputs internally
    const result = await runArch({
      cwd: TEST_DIR,
      rules: arch(...nestedRules.flat()),
    });

    expect(result.rulesChecked).toBe(2);
  });

  it('handles raw Rule objects', async () => {
    await setupFixtures({ 'test.ts': '' });
    const { runArch } = await import('../runner');

    const rawRule: Rule = {
      name: 'test',
      async *check() {
        // no violations
      },
    };

    const result = await runArch({
      cwd: TEST_DIR,
      rules: [rawRule],
    });

    expect(result.rulesChecked).toBe(1);
    expect(result.passed).toBe(true);
  });
});
