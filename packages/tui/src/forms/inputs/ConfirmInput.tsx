/**
 * Yes/no confirmation. Arrow keys (or `y`/`n`) toggle, Enter submits,
 * Esc cancels. Default selection comes from the `value` prop.
 */

import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useState } from 'react';

export interface ConfirmInputProps {
  readonly value?: boolean;
  /** Fires on each y/n toggle. Forms wire this to commit-on-navigation
   *  so Tab-ing away mid-pick still records the most recent choice. */
  readonly onChange?: (value: boolean) => void;
  readonly onSubmit?: (value: boolean) => void;
  readonly onCancel?: () => void;
  readonly focused?: boolean;
}

export function ConfirmInput({
  value = true,
  onChange,
  onSubmit,
  onCancel,
  focused = true,
}: Readonly<ConfirmInputProps>): React.ReactElement {
  const [yes, setYes] = useState(value);

  const set = (next: boolean): void => {
    setYes(next);
    onChange?.(next);
  };

  useInput(
    (input, key) => {
      if (key.escape) {
        onCancel?.();
        return;
      }
      if (key.return) {
        onSubmit?.(yes);
        return;
      }
      if (input === 'y' || input === 'Y') {
        set(true);
        return;
      }
      if (input === 'n' || input === 'N') {
        set(false);
        return;
      }
      if (key.leftArrow || key.rightArrow) {
        set(!yes);
      }
    },
    { isActive: focused }
  );

  return (
    <Box>
      <Text color={yes ? 'cyan' : 'gray'}>{yes ? '◆ ' : '○ '}</Text>
      <Text color={yes ? 'cyan' : undefined} bold={yes}>
        Yes
      </Text>
      <Text dimColor> </Text>
      <Text color={!yes ? 'cyan' : 'gray'}>{!yes ? '◆ ' : '○ '}</Text>
      <Text color={!yes ? 'cyan' : undefined} bold={!yes}>
        No
      </Text>
    </Box>
  );
}
