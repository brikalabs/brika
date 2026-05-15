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

import { Box, Text } from 'ink';
import type React from 'react';
import { createContext, type ReactNode, useContext } from 'react';

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
  readonly children?: ReactNode;
}

export function Pane({
  accent = 'default',
  padded = true,
  children,
}: Readonly<PaneProps>): React.ReactElement {
  return (
    <PaneContext.Provider value={{ accent }}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={BORDER_COLOR[accent]}
        paddingX={padded ? 1 : 0}
      >
        {children}
      </Box>
    </PaneContext.Provider>
  );
}

export function PaneHeader({
  children,
}: Readonly<{ children?: ReactNode }>): React.ReactElement {
  return <Box>{children}</Box>;
}

export function PaneTitle({
  children,
}: Readonly<{ children?: ReactNode }>): React.ReactElement {
  const { accent } = usePaneContext('PaneTitle');
  return (
    <Text bold color={TITLE_COLOR[accent]}>
      {children}
    </Text>
  );
}

/** Right-floats whatever you put in it (status badge, count, …). */
export function PaneActions({
  children,
}: Readonly<{ children?: ReactNode }>): React.ReactElement {
  return (
    <>
      <Box flexGrow={1} />
      <Box>{children}</Box>
    </>
  );
}

export function PaneBody({
  children,
}: Readonly<{ children?: ReactNode }>): React.ReactElement {
  return (
    <Box marginTop={1} flexDirection="column">
      {children}
    </Box>
  );
}

export function PaneFooter({
  children,
}: Readonly<{ children?: ReactNode }>): React.ReactElement {
  return (
    <Box marginTop={1}>
      <Box flexGrow={1} />
      {children}
    </Box>
  );
}
