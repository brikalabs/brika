/**
 * Central registry of navigable pages on the Clay docs site.
 *
 * Shared by SidebarNav and CommandPalette so adding a new page in one place
 * surfaces it in both. Keep `live` pages ordered by how they appear in the
 * sidebar; `comingSoon` entries render greyed-out and don't link anywhere.
 */

export interface SitePage {
  readonly label: string;
  readonly href: string;
  readonly group: 'Pages' | 'Components';
  readonly keywords?: readonly string[];
}

export const sitePages: readonly SitePage[] = [
  { label: 'Home', href: '/', group: 'Pages', keywords: ['landing', 'start'] },
  {
    label: 'Installation',
    href: '/installation',
    group: 'Pages',
    keywords: ['install', 'setup', 'getting started', 'npm', 'bun'],
  },
  { label: 'Colors', href: '/colors', group: 'Pages', keywords: ['palette', 'tokens', 'theme'] },
  {
    label: 'Themes',
    href: '/themes',
    group: 'Pages',
    keywords: ['preset', 'nord', 'dracula', 'dark', 'light', 'ocean'],
  },
  {
    label: 'All components',
    href: '/components',
    group: 'Components',
    keywords: ['index', 'gallery', 'list'],
  },
  {
    label: 'Button',
    href: '/components/button',
    group: 'Components',
    keywords: ['action', 'cta', 'cva'],
  },
  {
    label: 'Input',
    href: '/components/input',
    group: 'Components',
    keywords: ['text', 'field', 'form'],
  },
  {
    label: 'Card',
    href: '/components/card',
    group: 'Components',
    keywords: ['surface', 'container', 'tile'],
  },
];

export const comingSoonComponents: readonly string[] = [
  'Label',
  'Badge',
  'Separator',
  'Dialog',
  'Tooltip',
  'Tabs',
  'Popover',
  'Select',
  'Switch',
  'Alert',
  'Progress',
  'Skeleton',
];
