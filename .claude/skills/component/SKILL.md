---
name: component
description: Write or refactor React components following the project's component architecture. Use when creating new components, pages, or refactoring existing ones.
argument-hint: [component or page to create/refactor]
---

# Component Architecture

Write or refactor components for: $ARGUMENTS

---

## Component Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                         Page Components                          │
│  *Page.tsx - Route-level components, minimal logic              │
├─────────────────────────────────────────────────────────────────┤
│                       Feature Components                         │
│  components/*.tsx - Domain-specific, reusable within feature    │
├─────────────────────────────────────────────────────────────────┤
│                         UI Components                            │
│  @/components/ui/* - Design system primitives, fully reusable   │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
src/features/<feature>/
├── <Feature>Page.tsx       # Page component (route entry)
├── hooks.ts                # All hooks for the feature
├── api.ts                  # API functions and keys
├── types.ts                # Feature-specific types (if needed)
└── components/
    ├── <ComponentA>.tsx    # Feature component
    ├── <ComponentB>.tsx    # Feature component
    └── <ComponentC>Skeleton.tsx  # Loading skeleton
```

---

## Page Components (`*Page.tsx`)

**Purpose**: Route entry point, orchestrates feature components and hooks.

**Rules**:
- Minimal logic - delegate to hooks
- Compose feature components
- Handle loading/error states via `useDataView`
- Max ~150 lines (excluding JSX)

```tsx
// features/blocks/BlocksPage.tsx
import { useDataView } from '@/components/DataView';
import { useLocale } from '@/lib/use-locale';
import { BlockCard } from './components/BlockCard';
import { useBlocks, useBlocksFilters } from './hooks';

export function BlocksPage() {
  const { t } = useLocale();
  const { blockTypes, isLoading, getPlugin } = useBlocks();
  const filters = useBlocksFilters(blockTypes);

  const View = useDataView({
    data: filters.groupedBlocks,
    isLoading,
    isEmpty: (data) => Object.keys(data).length === 0,
  });

  return (
    <div className="space-y-6">
      <Header title={t('blocks:title')} count={filters.filteredBlocks.length} />
      <Filters filters={filters} getPlugin={getPlugin} />
      <View.Root>
        <View.Skeleton><BlocksSkeleton /></View.Skeleton>
        <View.Empty><EmptyState /></View.Empty>
        <View.Content>
          {(categories) => <BlocksGrid categories={categories} getPlugin={getPlugin} />}
        </View.Content>
      </View.Root>
    </div>
  );
}
```

---

## Feature Components (`components/*.tsx`)

**Purpose**: Reusable within the feature, encapsulate a specific piece of UI.

**Rules**:
- Single responsibility
- Props interface at top of file
- Max ~100 lines
- Use UI components from `@/components/ui`
- Can use feature hooks if needed

```tsx
// features/blocks/components/BlockCard.tsx
import type { Plugin } from '@brika/shared';
import { Link } from '@tanstack/react-router';
import { Avatar, AvatarFallback, AvatarImage, Badge, Card } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import type { BlockDefinition } from '../../workflows/api';

interface BlockCardProps {
  block: BlockDefinition;
  plugin?: Plugin;
}

export function BlockCard({ block, plugin }: Readonly<BlockCardProps>) {
  const { tp } = useLocale();
  const blockKey = block.id.split(':').pop() || block.id;
  const blockName = tp(block.pluginId, `blocks.${blockKey}.name`, block.name || blockKey);

  return (
    <Card className="h-full p-5">
      {/* Component JSX */}
    </Card>
  );
}
```

---

## Hooks (`hooks.ts`)

**Purpose**: Encapsulate all stateful logic, data fetching, and computed values.

**Rules**:
- One file per feature (unless very large)
- Export named hooks, not default
- Hooks return objects with clear property names
- Keep hooks focused - split if doing too much

```tsx
// features/blocks/hooks.ts
import { useMemo, useState } from 'react';
import { useDebouncedState } from '@/hooks/use-debounce';
import { usePlugins } from '../plugins/hooks';
import { useBlockTypes } from '../workflows/hooks';

// Data fetching hook
export function useBlocks() {
  const { data: blockTypes = [], isLoading } = useBlockTypes();
  const { data: plugins = [] } = usePlugins();

  const getPlugin = (pluginId: string) => plugins.find((p) => p.name === pluginId);

  return { blockTypes, plugins, isLoading, getPlugin };
}

// Filtering/state hook
export function useBlocksFilters(blockTypes: BlockDefinition[]) {
  const [search, setSearch] = useDebouncedState('', 200);
  const [pluginFilter, setPluginFilter] = useState('all');

  const filteredBlocks = useMemo(() => {
    return blockTypes.filter((b) => {
      if (pluginFilter !== 'all' && b.pluginId !== pluginFilter) return false;
      if (!search) return true;
      return b.name.toLowerCase().includes(search.toLowerCase());
    });
  }, [blockTypes, search, pluginFilter]);

  const clearFilters = () => {
    setSearch('');
    setPluginFilter('all');
  };

  return {
    search,
    setSearch,
    pluginFilter,
    setPluginFilter,
    filteredBlocks,
    clearFilters,
  };
}
```

---

## UI Components (`@/components/ui`)

**Purpose**: Design system primitives shared across all features.

**Rules**:
- Fully generic, no domain knowledge
- Styled with Tailwind/CSS variables
- Composable (slots, children, variants)
- Exported from barrel file

```tsx
// Already provided by the design system
import {
  Avatar, Badge, Button, Card, Input,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui';
```

---

## Patterns

### Props Interface

Always define props interface above component:

```tsx
interface ComponentProps {
  title: string;
  count?: number;
  onAction: () => void;
}

export function Component({ title, count = 0, onAction }: Readonly<ComponentProps>) {
  // ...
}
```

### Readonly Props

Use `Readonly<Props>` for all component props to prevent mutations.

### Composition Over Conditionals

Prefer composing smaller components over complex conditionals:

```tsx
// Avoid
function BlockCard({ block, plugin }) {
  return (
    <Card>
      {plugin ? (
        <div>/* 30 lines of plugin UI */</div>
      ) : (
        <div>/* 10 lines of fallback */</div>
      )}
    </Card>
  );
}

// Prefer
function BlockCard({ block, plugin }) {
  return (
    <Card>
      {plugin ? <PluginBadge plugin={plugin} /> : <PluginFallback name={block.pluginId} />}
    </Card>
  );
}
```

### Extract Complex JSX

If a section of JSX is more than ~15 lines, extract it:

```tsx
// Before
<div className="flex flex-wrap gap-2">
  <Select value={pluginFilter} onValueChange={setPluginFilter}>
    {/* 30 lines */}
  </Select>
  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
    {/* 20 lines */}
  </Select>
  {hasActiveFilters && <Button>Clear</Button>}
</div>

// After
<FilterBar filters={filters} getPlugin={getPlugin} />
```

---

## Skeleton Components

Create dedicated skeleton components for loading states:

```tsx
// features/blocks/components/BlockCardSkeleton.tsx
import { Card } from '@/components/ui';

export function BlockCardSkeleton() {
  return (
    <Card className="h-full p-5">
      <div className="flex h-full flex-col gap-4">
        <div className="h-10 w-10 animate-pulse rounded-full bg-accent" />
        <div className="space-y-2">
          <div className="h-4 w-3/4 animate-pulse rounded bg-accent" />
          <div className="h-3 w-full animate-pulse rounded bg-accent" />
        </div>
      </div>
    </Card>
  );
}
```

---

## Data View Pattern

Use `useDataView` for consistent loading/empty/content states:

```tsx
const View = useDataView({
  data: items,
  isLoading,
  isEmpty: (data) => data.length === 0,
});

return (
  <View.Root>
    <View.Skeleton><ItemsSkeleton /></View.Skeleton>
    <View.Empty><EmptyState /></View.Empty>
    <View.Content>{(items) => <ItemsList items={items} />}</View.Content>
  </View.Root>
);
```

---

## Checklist

When creating or refactoring components:

- [ ] Page component delegates logic to hooks
- [ ] Feature components are < 100 lines
- [ ] Props interface defined with `Readonly<>`
- [ ] Complex JSX extracted to separate components
- [ ] Loading states use skeleton components
- [ ] State/filtering logic in hooks, not components
- [ ] No hardcoded strings (use `useLocale`)
- [ ] UI primitives from `@/components/ui`

---

## Anti-patterns

| Avoid | Instead |
|-------|---------|
| Logic in page components | Extract to hooks |
| Components > 150 lines | Split into smaller components |
| Inline complex conditions | Extract to named components |
| Repeated JSX patterns | Create reusable component |
| State in presentational components | Lift to hooks/page |
| `Map`, `Set` for simple lookups | Use `.find()` or simple objects |
| Barrel files in components/ | Import directly |
