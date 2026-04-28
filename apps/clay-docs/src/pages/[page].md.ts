import type { APIContext, GetStaticPaths } from 'astro';
import { markdownResponse } from '~/lib/component-markdown';

/**
 * Component pages are handled separately by `components/[slug].md.ts` —
 * they have no `.mdx` source.
 */

const RAW_MDX = import.meta.glob<string>('./*.mdx', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const PAGES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(RAW_MDX).map(([path, content]) => {
    const slug = path.replace(/^\.\//, '').replace(/\.mdx$/, '');
    return [slug, normalizeMdx(content)];
  })
);

function normalizeMdx(content: string): string {
  const withoutFrontmatter = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n*/, '');
  return withoutFrontmatter.replace(/^(?:import\s[^\n]*\r?\n)+\r?\n*/, '');
}

export const getStaticPaths: GetStaticPaths = () =>
  Object.entries(PAGES).map(([page, content]) => ({
    params: { page },
    props: { content },
  }));

interface RouteProps {
  readonly content: string;
}

export function GET({ props }: APIContext<RouteProps>): Response {
  return markdownResponse(props.content);
}
