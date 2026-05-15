/**
 * `<StatTile>` — opinionated card for dashboard-style summary tiles.
 *
 *   ╭─ ● Hub ────────── ok ─╮     ╭─ ▣ Plugins ──── 2 ─╮
 *   │ pid 68267              │     │ ▸ logger v1.0      │
 *   │ /workspace             │     │ ▸ slack  v0.3      │
 *   │ ─────────────────────  │     │ ─────────────────  │
 *   │ Ctrl+S start  ^X stop  │     │ p to manage        │
 *   ╰────────────────────────╯     ╰────────────────────╯
 *
 * Composes a `<Pane>` with a consistent header/body/footer layout so
 * the dashboard doesn't have to wire the same structure three times.
 *
 * Slots:
 *   - `icon`    — single glyph in front of the title (eg. `●`, `▣`)
 *   - `title`   — section name
 *   - `status`  — node printed on the right of the header (badge,
 *                 count, ok-marker). Pass a number to render a dim
 *                 count chip automatically; pass any node for custom.
 *   - `footer`  — optional hint row pinned to the bottom of the tile
 *   - children  — the body / data block
 *
 * `accent` colors the title + border the same way `<Pane>` does, so
 * urgent tiles (`destructive`, `warning`) jump visually without the
 * caller hand-wiring color glue.
 */

import { Box, Text } from 'ink';
import type React from 'react';
import type { ReactNode } from 'react';
import {
  Pane,
  type PaneAccent,
  PaneActions,
  PaneBody,
  PaneFooter,
  PaneHeader,
  PaneTitle,
} from './Pane';

export interface StatTileProps {
  readonly title: string;
  /** Single glyph rendered as the tile's leading icon. */
  readonly icon?: string;
  /** Right-side header content. A number becomes a dim count chip;
   *  anything else (Badge, text, custom node) passes through. */
  readonly status?: ReactNode | number;
  readonly accent?: PaneAccent;
  readonly footer?: ReactNode;
  /** Grow to fill the parent's allocated width — pass `true` when
   *  tiling several `<StatTile>`s in a flex row so they share width
   *  evenly. Default `true` since the typical use is a grid. */
  readonly fill?: boolean;
  /** Fire when the user left-clicks anywhere on the tile. */
  readonly onPress?: () => void;
  readonly children?: ReactNode;
}

export function StatTile({
  title,
  icon,
  status,
  accent = 'default',
  footer,
  fill = true,
  onPress,
  children,
}: Readonly<StatTileProps>): React.ReactElement {
  return (
    <Pane accent={accent} fill={fill} onPress={onPress}>
      <PaneHeader>
        {icon ? <TileIcon icon={icon} /> : null}
        <PaneTitle>{title}</PaneTitle>
        {status === undefined ? null : (
          <PaneActions>
            {typeof status === 'number' ? <Text dimColor>{status}</Text> : status}
          </PaneActions>
        )}
      </PaneHeader>
      <PaneBody>{children}</PaneBody>
      {footer ? <PaneFooter>{footer}</PaneFooter> : null}
    </Pane>
  );
}

function TileIcon({ icon }: Readonly<{ icon: string }>): React.ReactElement {
  return (
    <Box marginRight={1}>
      <Text bold>{icon}</Text>
    </Box>
  );
}
