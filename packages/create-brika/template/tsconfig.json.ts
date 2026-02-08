import type { TemplateData } from '../src/render';

export default (data: TemplateData): string => {
  const opts: Record<string, unknown> = {
    target: 'ESNext',
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    noEmit: true,
    composite: true,
    types: ['bun-types'],
  };

  if (data.bricks) {
    opts.jsx = 'react-jsx';
    opts.jsxImportSource = '@brika/ui-kit';
  }

  return JSON.stringify({ compilerOptions: opts, include: ['src'] }, null, 2) + '\n';
};
