/**
 * `<Checkbox>` — single boolean toggle with keyboard + mouse activation.
 *
 *   [x] Enable feature      ← checked
 *   [ ] Enable feature      ← unchecked
 *
 *   <Checkbox checked={enabled} onChange={setEnabled}>
 *     Enable feature
 *   </Checkbox>
 *
 * Activation:
 *   - **Mouse**     — click anywhere on the row toggles it.
 *   - **Keyboard**  — Tab to focus, then `Space` or `Enter` toggles.
 *
 * Visual:
 *   - Focused row gets a `▸ ` caret and cyan accent.
 *   - Disabled rows render dim with a `·` marker instead of `x`.
 */

import { Box, type DOMElement, Text } from 'ink';
import type React from 'react';
import { type ReactNode, useCallback, useRef } from 'react';
import { useFocusable } from '../keys/useFocusable';

export interface CheckboxProps {
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  readonly disabled?: boolean;
  /** Stable focus id. Auto-generated if omitted. */
  readonly id?: string;
  /** Grab focus on mount. Default `false`. */
  readonly autoFocus?: boolean;
  readonly children?: ReactNode;
}

export function Checkbox({
  checked,
  onChange,
  disabled = false,
  id,
  autoFocus = false,
  children,
}: Readonly<CheckboxProps>): React.ReactElement {
  const ref = useRef<DOMElement>(null);
  const toggle = useCallback(() => {
    if (!disabled) {
      onChange(!checked);
    }
  }, [checked, disabled, onChange]);
  const { isFocused } = useFocusable({
    id,
    autoFocus,
    enabled: !disabled,
    onPress: toggle,
    ref,
  });

  const marker = checked ? 'x' : ' ';
  const accent = disabled ? undefined : 'cyan';
  return (
    <Box ref={ref}>
      {isFocused ? (
        <Text color={accent} bold>
          ▸{' '}
        </Text>
      ) : (
        <Text>{'  '}</Text>
      )}
      <Text color={disabled ? undefined : accent} dimColor={disabled}>
        [{disabled ? '·' : marker}]
      </Text>
      <Text dimColor={disabled}> {children}</Text>
    </Box>
  );
}
