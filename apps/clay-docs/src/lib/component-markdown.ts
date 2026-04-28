/**
 * Sections must mirror `pages/components/[slug].astro` so the `.md` view
 * stays in sync with what humans see on the rendered page.
 */

import type { ResolvedTokenSpec } from '@brika/clay/tokens';
import type { ComponentDemo, ComponentEntry } from './component-registry';
import { componentSourceUrl } from './github';
import type { ClayComponentDoc, ClayPropDoc } from './vite-plugin-clay-docgen';

interface RenderInput {
  readonly component: ComponentEntry;
  readonly docgen: ClayComponentDoc | undefined;
  readonly tokens: readonly ResolvedTokenSpec[];
}

export function renderComponentMarkdown({ component, docgen, tokens }: RenderInput): string {
  const [heroDemo, ...moreDemos] = component.demos;
  const sections = [
    headerSection(component),
    installSection(component),
    usageSection(heroDemo),
    examplesSection(moreDemos),
    accessibilitySection(component.accessibility ?? []),
    tokensSection(component.name, tokens),
    apiSection(component.name, docgen),
  ];
  return `${sections.filter(Boolean).join('\n').trimEnd()}\n`;
}

const MARKDOWN_HEADERS = { 'Content-Type': 'text/markdown; charset=utf-8' } as const;

export function markdownResponse(body: string): Response {
  return new Response(body, { headers: MARKDOWN_HEADERS });
}

function headerSection(component: ComponentEntry): string {
  return `# ${component.name}\n\n${component.description}\n\nSource: ${componentSourceUrl(component.slug)}\n`;
}

function installSection(component: ComponentEntry): string {
  return [
    '## Install',
    '',
    '```ts',
    `import { ${component.name} } from "@brika/clay";`,
    '```',
    '',
    'Granular import:',
    '',
    '```ts',
    `import { ${component.name} } from "@brika/clay/components/${component.slug}";`,
    '```',
    '',
  ].join('\n');
}

function usageSection(demo: ComponentDemo | undefined): string {
  if (!demo) {
    return '';
  }
  return ['## Usage', '', '```tsx', demo.code, '```', ''].join('\n');
}

function examplesSection(demos: readonly ComponentDemo[]): string {
  if (demos.length === 0) {
    return '';
  }
  const blocks = demos.map((demo) => {
    const description = demo.description ? `${demo.description}\n\n` : '';
    return `### ${demo.title}\n\n${description}\`\`\`tsx\n${demo.code}\n\`\`\`\n`;
  });
  return ['## Examples', '', ...blocks].join('\n');
}

function accessibilitySection(items: readonly string[]): string {
  if (items.length === 0) {
    return '';
  }
  const bullets = items.map((item) => `- ${item}`).join('\n');
  return `## Accessibility\n\n${bullets}\n`;
}

function tokensSection(name: string, tokens: readonly ResolvedTokenSpec[]): string {
  if (tokens.length === 0) {
    return '';
  }
  const intro = `Every CSS variable ${name} reads, with its default and the dotted path you'd write in a \`ThemeConfig\` to override it.`;
  const rows = tokens.map((token) => {
    const path = token.themePath ? `\`${token.themePath}\`` : '—';
    return `| \`--${token.name}\` | \`${token.defaultLight}\` | ${path} |`;
  });
  return [
    '## Theme tokens',
    '',
    intro,
    '',
    '| Variable | Default (light) | Theme path |',
    '| --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

function apiSection(name: string, docgen: ClayComponentDoc | undefined): string {
  if (!docgen || docgen.props.length === 0) {
    return `## API reference\n\n\`${name}\` exposes no wrapper-specific props — all attributes pass through to the underlying primitive.\n`;
  }
  const blocks = docgen.props.map(propBlock);
  return ['## API reference', '', ...blocks].join('\n');
}

function propBlock(prop: ClayPropDoc): string {
  const required = prop.required ? ' (required)' : '';
  const lines = [`### \`${prop.name}\`${required}`, '', `- Type: \`${prop.type}\``];
  if (prop.defaultValue !== null) {
    lines.push(`- Default: \`${prop.defaultValue}\``);
  }
  lines.push('');
  if (prop.description) {
    lines.push(prop.description, '');
  }
  return lines.join('\n');
}
