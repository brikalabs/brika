/**
 * Per-component identity for the theme builder UI: icon + grouping +
 * preview component, plus the helpers that derive the visible component
 * list from clay's TOKEN_REGISTRY.
 *
 * Kept separate from `ComponentsSection.tsx` so the file shows just one
 * concern (rendering); the icon/preview/group catalogue lives here and
 * is consumed by both the list and detail views.
 */

import type { TokenCategory } from '@brika/clay/tokens';
import {
  AlertCircle,
  BarChart2,
  BellRing,
  Box,
  BracketsIcon,
  ChevronDown,
  ChevronsRight,
  ChevronsUpDown,
  Code2,
  Combine,
  Expand,
  GalleryHorizontalEnd,
  Gauge,
  Image,
  Info,
  Key,
  LayoutPanelLeft,
  LayoutPanelTop,
  LayoutTemplate,
  type LucideIcon,
  Menu,
  Minus,
  MoreHorizontal,
  MousePointerClick,
  PanelLeft,
  PanelTop,
  RectangleHorizontal,
  Rows3,
  ScrollText,
  Shapes,
  SlidersHorizontal,
  SquareCheck,
  SquareStack,
  Tag,
  TextCursor,
  ToggleRight,
  Type,
  UserCircle,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { COMPONENT_TOKEN_INDEX } from './clay-tokens';
import {
  AlertDialogPreview,
  AlertPreview,
  AvatarPreview,
  BadgePreview,
  BreadcrumbPreview,
  ButtonGroupPreview,
  ButtonPreview,
  CardPreview,
  ChartPreview,
  CheckboxPreview,
  CodeBlockPreview,
  CollapsiblePreview,
  DialogPreview,
  EmptyStatePreview,
  IconPreview,
  InputGroupPreview,
  InputPreview,
  LabelPreview,
  MenuItemPreview,
  MenuPreview,
  OverflowListPreview,
  PageHeaderPreview,
  PasswordInputPreview,
  PopoverPreview,
  ProgressDisplayPreview,
  ProgressPreview,
  ScrollAreaPreview,
  SectionLabelPreview,
  SectionPreview,
  SelectPreview,
  SeparatorPreview,
  SheetPreview,
  SidebarPreview,
  SkeletonPreview,
  SliderPreview,
  SwitchPreview,
  SwitchThumbPreview,
  TablePreview,
  TabsPreview,
  TextareaPreview,
  ToastPreview,
  TooltipPreview,
} from './components/components-previews';

export interface ComponentIdentity {
  key: string;
  icon: LucideIcon;
  Preview?: () => ReactNode;
}

/* ─── Per-component icon + preview catalogue ───────────────────── */

const IDENTITY: Record<string, Omit<ComponentIdentity, 'key'>> = {
  alert: { icon: AlertCircle, Preview: AlertPreview },
  avatar: { icon: UserCircle, Preview: AvatarPreview },
  badge: { icon: Tag, Preview: BadgePreview },
  button: { icon: MousePointerClick, Preview: ButtonPreview },
  card: { icon: RectangleHorizontal, Preview: CardPreview },
  checkbox: { icon: SquareCheck, Preview: CheckboxPreview },
  'code-block': { icon: Code2, Preview: CodeBlockPreview },
  dialog: { icon: SquareStack, Preview: DialogPreview },
  icon: { icon: Image, Preview: IconPreview },
  input: { icon: TextCursor, Preview: InputPreview },
  menu: { icon: Menu, Preview: MenuPreview },
  'menu-item': { icon: Rows3, Preview: MenuItemPreview },
  'password-input': { icon: Key, Preview: PasswordInputPreview },
  popover: { icon: PanelTop, Preview: PopoverPreview },
  progress: { icon: SlidersHorizontal, Preview: ProgressPreview },
  select: { icon: ChevronsUpDown, Preview: SelectPreview },
  separator: { icon: Minus, Preview: SeparatorPreview },
  sheet: { icon: LayoutPanelLeft, Preview: SheetPreview },
  sidebar: { icon: PanelLeft, Preview: SidebarPreview },
  slider: { icon: SlidersHorizontal, Preview: SliderPreview },
  switch: { icon: ToggleRight, Preview: SwitchPreview },
  'switch-thumb': { icon: ToggleRight, Preview: SwitchThumbPreview },
  table: { icon: Rows3, Preview: TablePreview },
  tabs: { icon: LayoutPanelTop, Preview: TabsPreview },
  textarea: { icon: TextCursor, Preview: TextareaPreview },
  toast: { icon: BellRing, Preview: ToastPreview },
  tooltip: { icon: Info, Preview: TooltipPreview },
  'alert-dialog': { icon: SquareStack, Preview: AlertDialogPreview },
  breadcrumb: { icon: ChevronsRight, Preview: BreadcrumbPreview },
  'button-group': { icon: GalleryHorizontalEnd, Preview: ButtonGroupPreview },
  chart: { icon: BarChart2, Preview: ChartPreview },
  collapsible: { icon: ChevronDown, Preview: CollapsiblePreview },
  'empty-state': { icon: Expand, Preview: EmptyStatePreview },
  'input-group': { icon: Combine, Preview: InputGroupPreview },
  label: { icon: Type, Preview: LabelPreview },
  'overflow-list': { icon: MoreHorizontal, Preview: OverflowListPreview },
  'page-header': { icon: LayoutTemplate, Preview: PageHeaderPreview },
  'progress-display': { icon: Gauge, Preview: ProgressDisplayPreview },
  'scroll-area': { icon: ScrollText, Preview: ScrollAreaPreview },
  section: { icon: BracketsIcon, Preview: SectionPreview },
  'section-label': { icon: Shapes, Preview: SectionLabelPreview },
  skeleton: { icon: Box, Preview: SkeletonPreview },
};

const FALLBACK_IDENTITY: Omit<ComponentIdentity, 'key'> = { icon: Box };

export function identityFor(component: string): ComponentIdentity {
  const m = IDENTITY[component] ?? FALLBACK_IDENTITY;
  return { key: component, ...m };
}

/* ─── Curated grouping for the list view ───────────────────────── */

const GROUP_ORDER: readonly { id: string; members: readonly string[] }[] = [
  {
    id: 'controls',
    members: [
      'button',
      'button-group',
      'input',
      'input-group',
      'textarea',
      'password-input',
      'select',
      'checkbox',
      'switch',
      'switch-thumb',
      'collapsible',
      'tabs',
      'badge',
      'label',
      'slider',
    ],
  },
  {
    id: 'surfaces',
    members: [
      'card',
      'section',
      'section-label',
      'alert',
      'empty-state',
      'toast',
      'avatar',
      'separator',
      'progress',
      'progress-display',
      'skeleton',
      'chart',
      'code-block',
      'icon',
    ],
  },
  {
    id: 'overlays',
    members: ['dialog', 'alert-dialog', 'sheet', 'popover', 'menu', 'menu-item', 'tooltip'],
  },
  {
    id: 'layout',
    members: ['sidebar', 'table', 'page-header', 'breadcrumb', 'scroll-area', 'overflow-list'],
  },
];

export interface ComponentGroup {
  id: string;
  items: readonly ComponentIdentity[];
}

function buildGroups(): readonly ComponentGroup[] {
  const seen = new Set<string>();
  const out: ComponentGroup[] = [];
  for (const g of GROUP_ORDER) {
    const items: ComponentIdentity[] = [];
    for (const name of g.members) {
      items.push(identityFor(name));
      seen.add(name);
    }
    if (items.length > 0) {
      out.push({ id: g.id, items });
    }
  }
  // Any token-bearing component not in the curated groups: bucket under "other".
  const leftover = Object.keys(COMPONENT_TOKEN_INDEX).filter((n) => !seen.has(n));
  if (leftover.length > 0) {
    out.push({
      id: 'other',
      items: leftover.toSorted((a, b) => a.localeCompare(b)).map(identityFor),
    });
  }
  return out;
}

export const GROUPS: readonly ComponentGroup[] = buildGroups();

/* ─── Per-category icon (used by the detail view) ──────────────── */

export const CATEGORY_ICONS: Record<TokenCategory, LucideIcon> = {
  color: Shapes,
  geometry: Box,
  border: RectangleHorizontal,
  typography: Type,
  elevation: SquareStack,
  focus: AlertCircle,
  motion: SlidersHorizontal,
  state: ToggleRight,
};
