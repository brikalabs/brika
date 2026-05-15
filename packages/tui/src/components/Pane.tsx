/**
 * `<Pane>` — bordered section primitive. Sits between `<Box>` (raw)
 * and `<Card>` (heavyweight): a rounded outline with optional header
 * and footer slots, plus an accent that signals focus / status.
 *
 *   <Pane accent="cyan">
 *     <PaneHeader>
 *       <PaneTitle>Workflows</PaneTitle>
 *       <PaneActions>
 *         <Badge variant="info">3</Badge>
 *       </PaneActions>
 *     </PaneHeader>
 *     <PaneBody>
 *       …
 *     </PaneBody>
 *     <PaneFooter>
 *       <Text dimColor>Press i to install</Text>
 *     </PaneFooter>
 *   </Pane>
 *
 * Slots are sub-components (shadcn shape) so you only render the
 * bits you need — bare `<Pane>` with arbitrary `<Box>` children is
 * also fine for cases without a clear header / body / footer split.
 *
 * `accent` styles the border + title color. Variants:
 *   - `default`     — gray border (resting state).
 *   - `focused`     — cyan border, signalling keyboard focus.
 *   - `success`     — green.
 *   - `warning`     — yellow.
 *   - `destructive` — red.
 *
 * `padded={false}` removes the default `paddingX={1}` for cases
 * where the pane wraps a flush component (e.g. a `<Table>`).
 */

import { Box, type DOMElement, Text } from 'ink';
import type React from 'react';
import { createContext, type ReactNode, useContext, useMemo, useRef } from 'react';
import { useFocusable } from '../keys/useFocusable';
import { useClickable } from '../mouse/useClickable';

export type PaneAccent = 'default' | 'focused' | 'success' | 'warning' | 'destructive';

interface PaneContextValue {
  readonly accent: PaneAccent;
}

const PaneContext = createContext<PaneContextValue | null>(null);

function usePaneContext(component: string): PaneContextValue {
  const ctx = useContext(PaneContext);
  if (!ctx) {
    throw new Error(`<${component}> must be rendered inside a <Pane>`);
  }
  return ctx;
}

const BORDER_COLOR: Readonly<Record<PaneAccent, string>> = {
  default: 'gray',
  focused: 'cyan',
  success: 'green',
  warning: 'yellow',
  destructive: 'red',
};

const TITLE_COLOR: Readonly<Record<PaneAccent, string | undefined>> = {
  default: undefined,
  focused: 'cyan',
  success: 'green',
  warning: 'yellow',
  destructive: 'red',
};

export interface PaneProps {
  readonly accent?: PaneAccent;
  /** Default `true`. Set `false` to remove horizontal padding. */
  readonly padded?: boolean;
  /** Grow to fill the parent's cross-axis width. Use inside a flex row
   *  when several Panes should split the row evenly (dashboard tiles,
   *  side-by-side detail panes, etc.). Default `false` — Panes size
   *  to their content like cards. */
  readonly fill?: boolean;
  /** Fire when the user clicks the pane or hits Enter / Space while
   *  it has focus. Panes without an `onPress` aren't focusable. */
  readonly onPress?: () => void;
  /** DOM-style tab order — `-1` opts out of the Tab cycle. Default `0`. */
  readonly tabIndex?: number;
  /** Stable focus id. Auto-generated when omitted. */
  readonly id?: string;
  readonly children?: ReactNode;
}

export function Pane({
  accent = 'default',
  padded = true,
  fill = false,
  onPress,
  tabIndex,
  id,
  children,
}: Readonly<PaneProps>): React.ReactElement {
  const ref = useRef<DOMElement>(null);
  const focusable = Boolean(onPress);
  const { isFocused } = useFocusable({ id, tabIndex, onPress, enabled: focusable });
  useClickable(ref, onPress);
  const ctxValue = useMemo(() => ({ accent }), [accent]);
  const focused = focusable && isFocused;
  return (
    <PaneContext.Provider value={ctxValue}>
      <Box
        ref={ref}
        flexDirection="column"
        flexGrow={fill ? 1 : 0}
        flexBasis={fill ? 0 : undefined}
        borderStyle={focused ? 'bold' : 'round'}
        borderColor={focused ? 'cyan' : BORDER_COLOR[accent]}
        borderDimColor={!focused && accent === 'default'}
        paddingX={padded ? 1 : 0}
      >
        {children}
      </Box>
    </PaneContext.Provider>
  );
}

export function PaneHeader({ children }: Readonly<{ children?: ReactNode }>): React.ReactElement {
  return <Box>{children}</Box>;
}

export function PaneTitle({ children }: Readonly<{ children?: ReactNode }>): React.ReactElement {
  const { accent } = usePaneContext('PaneTitle');
  return (
    <Text bold color={TITLE_COLOR[accent]}>
      {children}
    </Text>
  );
}

/** Right-floats whatever you put in it (status badge, count, …). */
export function PaneActions({ children }: Readonly<{ children?: ReactNode }>): React.ReactElement {
  return (
    <>
      <Box flexGrow={1} />
      <Box>{children}</Box>
    </>
  );
}

export function PaneBody({ children }: Readonly<{ children?: ReactNode }>): React.ReactElement {
  return (
    <Box marginTop={1} flexDirection="column">
      {children}
    </Box>
  );
}

export function PaneFooter({ children }: Readonly<{ children?: ReactNode }>): React.ReactElement {
  return (
    <Box marginTop={1}>
      <Box flexGrow={1} />
      {children}
    </Box>
  );
}
