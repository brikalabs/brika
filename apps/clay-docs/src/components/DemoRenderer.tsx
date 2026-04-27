import { type ComponentType, createElement } from 'react';

type DemoModule = Readonly<Record<string, ComponentType<Record<string, never>>>>;

const demoModules = import.meta.glob<DemoModule>('./demos/*.tsx', { eager: true });

const demosBySlug: ReadonlyMap<string, DemoModule> = new Map(
  Object.entries(demoModules).map(([path, mod]) => {
    const match = /\/demos\/([a-z0-9-]+)\.tsx$/.exec(path);
    return [match?.[1] ?? path, mod];
  })
);

interface DemoRendererProps {
  readonly slug: string;
  readonly demoName: string;
}

/**
 * Render a demo function by its slug + exported name.
 *
 * Wired this way because Astro doesn't let us hydrate a dynamic component
 * variable directly with `client:*`; the renderer is itself a hydratable
 * island that does the lookup on the client.
 */
export function DemoRenderer({ slug, demoName }: DemoRendererProps) {
  const mod = demosBySlug.get(slug);
  if (!mod) {
    return (
      <p className="font-mono text-clay-subtle text-xs">No demo file for &quot;{slug}&quot;.</p>
    );
  }
  const Demo = mod[demoName];
  if (!Demo) {
    return (
      <p className="font-mono text-clay-subtle text-xs">
        No exported demo named &quot;{demoName}&quot; in {slug}.tsx.
      </p>
    );
  }
  return createElement(Demo);
}
