/**
 * `<Confirm>` — y/n alert-dialog, modelled on shadcn's `<AlertDialog>`.
 * Title and description live in sub-components so the body is free
 * to grow without piling props onto the parent:
 *
 *   <Confirm onConfirm={uninstall} onCancel={close} variant="destructive">
 *     <ConfirmTitle>Uninstall Spotify?</ConfirmTitle>
 *     <ConfirmDescription>
 *       Removes the plugin from brika.yml and clears its state + secrets.
 *     </ConfirmDescription>
 *   </Confirm>
 *
 * The parent owns the keyboard wiring (`y` / Enter ⇒ confirm, `n` /
 * Esc ⇒ cancel), the border, and a fixed footer hint. Captures
 * global input so destructive `y` doesn't bleed into other handlers.
 *
 * Variants:
 *   - `default`     — cyan accent.
 *   - `destructive` — red accent, "delete" hint label.
 */

import { Box, Text, useInput } from 'ink';
import { createContext, type ReactNode, useContext } from 'react';
import { useCaptureInput } from '../shell/useTuiShell';

export type ConfirmVariant = 'default' | 'destructive';

interface ConfirmContextValue {
  readonly accent: string;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

function useConfirmContext(component: string): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error(`<${component}> must be rendered inside a <Confirm>`);
  }
  return ctx;
}

export interface ConfirmProps {
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly variant?: ConfirmVariant;
  readonly children?: ReactNode;
}

export function Confirm({
  onConfirm,
  onCancel,
  variant = 'default',
  children,
}: Readonly<ConfirmProps>): React.ReactElement {
  useCaptureInput();
  useInput((input, key) => {
    if (key.escape || input === 'n' || input === 'N') {
      onCancel();
      return;
    }
    if (input === 'y' || input === 'Y' || key.return) {
      onConfirm();
    }
  });

  const accent = variant === 'destructive' ? 'red' : 'cyan';
  const verb = variant === 'destructive' ? 'delete' : 'confirm';

  return (
    <ConfirmContext.Provider value={{ accent }}>
      <Box flexDirection="column" borderStyle="round" borderColor={accent} paddingX={1}>
        {children}
        <Box marginTop={1}>
          <Text>
            <Text color={accent}>y</Text>
            <Text dimColor>{` ${verb} · `}</Text>
            <Text>n</Text>
            <Text dimColor> / Esc cancel</Text>
          </Text>
        </Box>
      </Box>
    </ConfirmContext.Provider>
  );
}

export function ConfirmTitle({
  children,
}: Readonly<{ children?: ReactNode }>): React.ReactElement {
  const { accent } = useConfirmContext('ConfirmTitle');
  return (
    <Text bold color={accent}>
      {children}
    </Text>
  );
}

export function ConfirmDescription({
  children,
}: Readonly<{ children?: ReactNode }>): React.ReactElement {
  return (
    <Box marginTop={1}>
      <Text dimColor>{children}</Text>
    </Box>
  );
}
