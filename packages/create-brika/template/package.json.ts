import type { TemplateData } from '../src/render';

export default function template(data: TemplateData): string {
  const pkg: Record<string, unknown> = {
    $schema: 'https://schema.brika.dev/plugin.schema.json',
    name: data.packageName,
    displayName: data.pascal,
    version: '0.1.0',
    description: data.description,
    author: data.author,
    keywords: ['brika', 'brika-plugin'],
    engines: { brika: `^${data.sdkVersion}` },
    type: 'module',
    main: './src/index.ts',
    exports: { '.': './src/index.ts' },
    scripts: {
      link: 'bun link',
      tsc: 'bunx --bun tsc --noEmit',
      prepublishOnly: 'brika-verify-plugin',
    },
  };

  if (data.blocks) {
    pkg.blocks = [{
      id: data.id, category: data.category, icon: 'box', color: '#3b82f6',
    }];
  }

  if (data.bricks) {
    pkg.bricks = [{
      id: data.id, icon: 'layout-dashboard', color: '#3b82f6',
    }];
  }

  if (data.sparks) {
    pkg.sparks = [{ id: data.id }];
  }

  pkg.dependencies = { '@brika/sdk': `^${data.sdkVersion}` };
  pkg.devDependencies = { 'bun-types': '^1.3.5' };

  return JSON.stringify(pkg, null, 2) + '\n';
}
