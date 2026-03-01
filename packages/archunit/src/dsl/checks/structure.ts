import { registerCheck } from '../file-rule';

declare module '../file-rule' {
  interface FileRule {
    /** Files should export a class */
    exportClass(): this;
    /** Files should export a function */
    exportFunction(): this;
    /** Class names should match a pattern */
    haveClassNamed(pattern: RegExp, description?: string): this;
    /** Files should extend a base class */
    extendClass(baseName: string): this;
    /** Files should implement an interface */
    implementInterface(interfaceName: string): this;
  }
}

registerCheck('exportClass', () => ({
  name: 'export class',
  check: (_, file, content) => {
    if (!/export\s+class\s+\w+/.test(content)) {
      return {
        file,
        message: 'Missing exported class',
      };
    }
  },
}));

registerCheck('exportFunction', () => ({
  name: 'export function',
  check: (_, file, content) => {
    if (!/export\s+(?:async\s+)?function\s+\w+/.test(content)) {
      return {
        file,
        message: 'Missing exported function',
      };
    }
  },
}));

registerCheck('haveClassNamed', (pattern: RegExp, description?: string) => {
  const desc = description ?? pattern.source;
  return {
    name: `class named ${desc}`,
    check: (_, file, content) => {
      const match = /class\s+(\w+)/.exec(content);
      if (!match?.[1]) {
        return {
          file,
          message: 'No class found',
        };
      }
      const className = match[1];
      if (!pattern.test(className)) {
        return {
          file,
          message: `Class "${className}" doesn't match ${desc}`,
        };
      }
    },
  };
});

registerCheck('extendClass', (baseName: string) => ({
  name: `extend ${baseName}`,
  check: (_, file, content) => {
    const pattern = new RegExp(String.raw`class\s+\w+\s+extends\s+${baseName}`);
    if (!pattern.test(content)) {
      return {
        file,
        message: `Must extend ${baseName}`,
      };
    }
  },
}));

registerCheck('implementInterface', (interfaceName: string) => ({
  name: `implement ${interfaceName}`,
  check: (_, file, content) => {
    const pattern = new RegExp(String.raw`class\s+\w+[^{]*implements[^{]*${interfaceName}`);
    if (!pattern.test(content)) {
      return {
        file,
        message: `Must implement ${interfaceName}`,
      };
    }
  },
}));
