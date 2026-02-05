import { registerCheck } from '../file-rule';

declare module '../file-rule' {
  interface FileRule {
    /** Files should be named in PascalCase */
    bePascalCase(): this;
    /** Files should be named in camelCase */
    beCamelCase(): this;
    /** Files should be named in kebab-case */
    beKebabCase(): this;
  }
}

registerCheck('bePascalCase', () => ({
  name: 'PascalCase',
  check: (_, file) => {
    const name = file
      .split('/')
      .pop()!
      .replace(/\.\w+$/, '');
    if (!/^[A-Z][a-zA-Z0-9]*$/.test(name)) {
      return { file, message: `"${name}" is not PascalCase` };
    }
  },
}));

registerCheck('beCamelCase', () => ({
  name: 'camelCase',
  check: (_, file) => {
    const name = file
      .split('/')
      .pop()!
      .replace(/\.\w+$/, '');
    if (!/^[a-z][a-zA-Z0-9]*$/.test(name)) {
      return { file, message: `"${name}" is not camelCase` };
    }
  },
}));

registerCheck('beKebabCase', () => ({
  name: 'kebab-case',
  check: (_, file) => {
    const name = file
      .split('/')
      .pop()!
      .replace(/\.\w+$/, '');
    if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
      return { file, message: `"${name}" is not kebab-case` };
    }
  },
}));
