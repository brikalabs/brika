# @brika/ui-kit

Descriptor types and builder functions for Brika plugin UI **bricks**.

Bricks are the dashboard tiles a plugin contributes. They're described declaratively as a tree of typed nodes — buttons, layouts, tables, charts, intl strings — and rendered by the host UI without the plugin ever shipping React or DOM code itself. This package is the shared vocabulary that lets the SDK author bricks and the UI render them.

**Zero React, zero DOM.** Both the plugin SDK (`@brika/sdk`) and the host UI (`apps/ui`) consume these types; the renderer lives in the host.

## What's exported

- **Node descriptors** — `BoxNode`, `RowNode`, `ColumnNode`, `GridNode`, `TableNode`, `ChartNode`, `ButtonNode`, `TextInputNode`, `SelectNode`, …
- **Color tokens** — semantic palette for the brick renderer.
- **i18n / intl refs** — `I18nRef`, `IntlRef` for translatable strings inside descriptors.
- **`tailwind-theme.css`** — Tailwind theme layer the host applies so brick colors stay consistent.

## Usage

In a plugin brick:

```tsx
import type { BoxNode, ButtonNode } from '@brika/ui-kit';

export const brick: BoxNode = {
  type: 'box',
  padding: 'md',
  children: [
    {
      type: 'button',
      label: { type: 'i18n', key: 'brick.refresh' },
      onClick: { actionId: 'refresh' },
    } satisfies ButtonNode,
  ],
};
```

The host UI walks the tree and renders each node with its registered component.

## Adding a new node type

1. Add the `XxxNode` type to `src/descriptors.ts`.
2. Add it to `NodeTypeMap`.
3. Register a renderer on the UI side under `apps/ui/src/features/bricks/nodes/`.

## Consumers

- `@brika/sdk` — exposes the descriptors to plugin authors.
- `apps/ui` — renders them.
- Every plugin that ships a brick.
