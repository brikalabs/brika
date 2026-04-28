import type { APIRoute } from 'astro';
import { COMPONENT_GROUPS, COMPONENTS, componentsInGroup } from '~/lib/component-registry';

const RAW_MDX = import.meta.glob<string>('./*.mdx', {
  query: '?raw',
  import: 'default',
  eager: true,
});

interface DocPage {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
}

const DOC_PAGES: readonly DocPage[] = Object.entries(RAW_MDX)
  .map(([path, content]) => {
    const slug = path.replace(/^\.\//, '').replace(/\.mdx$/, '');
    return {
      slug,
      title: frontmatterField(content, 'title') ?? slug,
      description: frontmatterField(content, 'description') ?? '',
    };
  })
  .sort((a, b) => a.slug.localeCompare(b.slug));

function frontmatterField(content: string, key: string): string | null {
  const match = new RegExp(String.raw`^${key}:\s*"([^"]*)"`, 'm').exec(content);
  return match?.[1] ?? null;
}

function entryLine(href: string, label: string, description: string): string {
  const tail = description ? `: ${description}` : '';
  return `- [${label}](${href})${tail}`;
}

export const GET: APIRoute = ({ site }) => {
  if (!site) {
    throw new Error('astro.config.site must be set to generate llms.txt');
  }
  const url = (path: string) => new URL(path, site).href;
  const lines: string[] = [
    '# Clay',
    '',
    `> Clay is Brika's React component library. Tokens, themes, and ${COMPONENTS.length} primitives behind a Tailwind v4 entry.`,
    '',
    '## Documentation',
    '',
    ...DOC_PAGES.map((page) => entryLine(url(`/${page.slug}.md`), page.title, page.description)),
    '',
  ];

  for (const group of COMPONENT_GROUPS) {
    const items = componentsInGroup(group);
    if (items.length === 0) {
      continue;
    }
    lines.push(`## ${group}`, '');
    for (const component of items) {
      lines.push(
        entryLine(url(`/components/${component.slug}.md`), component.name, component.description)
      );
    }
    lines.push('');
  }

  return new Response(`${lines.join('\n').trimEnd()}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
