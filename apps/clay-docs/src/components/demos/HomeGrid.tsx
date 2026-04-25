import { COMPONENTS } from '~/lib/component-registry';
import { DemoRenderer } from '../DemoRenderer';

const FEATURED: ReadonlyArray<{ slug: string; demoName: string }> = [
  { slug: 'button', demoName: 'ButtonVariantsDemo' },
  { slug: 'card', demoName: 'CardAccentDemo' },
  { slug: 'input', demoName: 'InputTypesDemo' },
  { slug: 'switch', demoName: 'SwitchControlledDemo' },
  { slug: 'badge', demoName: 'BadgeVariantsDemo' },
  { slug: 'avatar', demoName: 'AvatarGroupDemo' },
  { slug: 'progress-display', demoName: 'ProgressDisplayDefaultDemo' },
  { slug: 'breadcrumb', demoName: 'BreadcrumbDefaultDemo' },
  { slug: 'tabs', demoName: 'TabsDefaultDemo' },
];

const FEATURED_BY_SLUG = new Set(FEATURED.map((f) => f.slug));

const remaining = COMPONENTS.filter((c) => !FEATURED_BY_SLUG.has(c.slug)).slice(0, 6);

export function HomeGrid() {
  return (
    <div className="grid grid-cols-1 border-clay-hairline border-b sm:grid-cols-2 lg:grid-cols-3">
      {FEATURED.map((entry) => {
        const component = COMPONENTS.find((c) => c.slug === entry.slug);
        const name = component?.name ?? entry.slug;
        return (
          <a
            key={entry.slug}
            href={`/components/${entry.slug}`}
            className="group flex min-h-65 flex-col border-clay-hairline border-t border-r transition-colors hover:bg-clay-base"
          >
            <div className="flex flex-1 items-center justify-center p-6">
              <DemoRenderer slug={entry.slug} demoName={entry.demoName} />
            </div>
            <div className="border-clay-hairline border-t px-4 py-2 font-mono text-clay-subtle text-xs transition-colors group-hover:text-clay-default">
              {name}
            </div>
          </a>
        );
      })}
      {remaining.map((component) => (
        <a
          key={component.slug}
          href={`/components/${component.slug}`}
          className="group flex min-h-65 flex-col border-clay-hairline border-t border-r transition-colors hover:bg-clay-base"
        >
          <div className="flex flex-1 items-center justify-center p-6">
            <span className="font-mono text-clay-subtle text-xs uppercase tracking-wider transition-colors group-hover:text-clay-default">
              {component.group}
            </span>
          </div>
          <div className="border-clay-hairline border-t px-4 py-2 font-mono text-clay-subtle text-xs transition-colors group-hover:text-clay-default">
            {component.name}
          </div>
        </a>
      ))}
    </div>
  );
}
