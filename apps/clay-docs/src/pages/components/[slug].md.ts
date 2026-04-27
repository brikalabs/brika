import docgen from 'virtual:clay-docgen';
import { type ResolvedTokenSpec, TOKEN_REGISTRY } from '@brika/clay/tokens';
import type { APIContext, GetStaticPaths } from 'astro';
import { markdownResponse, renderComponentMarkdown } from '~/lib/component-markdown';
import { COMPONENTS, type ComponentEntry } from '~/lib/component-registry';

const TOKENS_BY_SLUG = ((): ReadonlyMap<string, readonly ResolvedTokenSpec[]> => {
  const map = new Map<string, ResolvedTokenSpec[]>();
  for (const token of TOKEN_REGISTRY) {
    if (!token.appliesTo) {
      continue;
    }
    const bucket = map.get(token.appliesTo);
    if (bucket) {
      bucket.push(token);
    } else {
      map.set(token.appliesTo, [token]);
    }
  }
  return map;
})();

export const getStaticPaths: GetStaticPaths = () =>
  COMPONENTS.map((component) => ({
    params: { slug: component.slug },
    props: { component },
  }));

interface RouteProps {
  readonly component: ComponentEntry;
}

export function GET({ props }: APIContext<RouteProps>): Response {
  const { component } = props;
  return markdownResponse(
    renderComponentMarkdown({
      component,
      docgen: docgen[component.name],
      tokens: TOKENS_BY_SLUG.get(component.slug) ?? [],
    })
  );
}
