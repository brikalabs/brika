import { registerCheck } from '../file-rule';

declare module '../file-rule' {
  interface FileRule {
    /** Class should have a decorator (e.g., @singleton, @injectable) */
    haveClassDecorator(name: string): this;
    /** Methods should have a decorator */
    haveMethodDecorator(name: string): this;
    /** Class should not have a decorator */
    notHaveClassDecorator(name: string): this;
  }
}

const normalize = (name: string) => (name.startsWith('@') ? name.slice(1) : name);

registerCheck('haveClassDecorator', (name: string) => {
  const decoratorName = normalize(name);
  return {
    name: `class has @${decoratorName}`,
    check: (_, file, content) => {
      const pattern = new RegExp(
        String.raw`@${decoratorName}\s*\([^)]*\)[\s\S]*?(?:export\s+)?class\s+\w+`
      );
      if (!pattern.test(content)) {
        return { file, message: `Class missing @${decoratorName}() decorator` };
      }
    },
  };
});

registerCheck('haveMethodDecorator', (name: string) => {
  const decoratorName = normalize(name);
  return {
    name: `methods have @${decoratorName}`,
    check: (_, file, content) => {
      const pattern = new RegExp(
        String.raw`@${decoratorName}\s*\([^)]*\)[\s\n]*(?:async\s+)?\w+\s*\(`
      );
      if (!pattern.test(content)) {
        return { file, message: `No method with @${decoratorName}() decorator` };
      }
    },
  };
});

registerCheck('notHaveClassDecorator', (name: string) => {
  const decoratorName = normalize(name);
  return {
    name: `class not have @${decoratorName}`,
    check: (_, file, content) => {
      const pattern = new RegExp(
        String.raw`@${decoratorName}\s*\([^)]*\)[\s\S]*?(?:export\s+)?class\s+\w+`
      );
      const match = pattern.exec(content);
      if (match) {
        const line = content.substring(0, match.index).split('\n').length;
        return { file, line, message: `Class has @${decoratorName}() decorator` };
      }
    },
  };
});
