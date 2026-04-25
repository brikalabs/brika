/**
 * Site-wide page index, used by SidebarNav and CommandPalette.
 *
 * Static pages are hand-listed; component pages are derived from the
 * component registry so adding a component automatically surfaces it
 * in nav and search.
 */

import { COMPONENTS } from './component-registry';

export interface SitePage {
  readonly label: string;
  readonly href: string;
  readonly group: 'Pages' | 'Components';
  readonly keywords?: readonly string[];
}

const staticPages: readonly SitePage[] = [
  { label: 'Home', href: '/', group: 'Pages', keywords: ['landing', 'start'] },
  {
    label: 'Installation',
    href: '/installation',
    group: 'Pages',
    keywords: ['install', 'setup', 'getting started', 'npm', 'bun'],
  },
  { label: 'Colors', href: '/colors', group: 'Pages', keywords: ['palette', 'tokens', 'theme'] },
  {
    label: 'Tokens',
    href: '/tokens',
    group: 'Pages',
    keywords: ['variables', 'css', 'css custom property', 'registry', 'token', 'design tokens'],
  },
  {
    label: 'Themes',
    href: '/themes',
    group: 'Pages',
    keywords: ['preset', 'nord', 'dracula', 'dark', 'light', 'ocean', 'brutalist', 'editorial', 'terminal', 'skeuomorph'],
  },
  {
    label: 'Theming',
    href: '/theming',
    group: 'Pages',
    keywords: ['guide', 'apply theme', 'theme config', 'authoring'],
  },
  {
    label: 'All components',
    href: '/components',
    group: 'Components',
    keywords: ['index', 'gallery', 'list'],
  },
];

const componentPages: readonly SitePage[] = COMPONENTS.map((component) => ({
  label: component.name,
  href: `/components/${component.slug}`,
  group: 'Components',
  keywords: [component.group.toLowerCase(), component.slug],
}));

export const sitePages: readonly SitePage[] = [...staticPages, ...componentPages];
