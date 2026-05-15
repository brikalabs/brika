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
 *   - Focused row gets a `▸ ` caret and cyan accent so it's visible
 *     in keyboard navigation.
 *   - Disabled rows render dim with a `·` marker instead of `x`.
 *
 * Like `<Button>` this component owns its focus via ink's manager —
 * pass an explicit `id` if you need to drive focus from outside,
 * otherwise it auto-assigns one.
 */

import { Box, type DOMElement, Text, useFocus, useInput } from 'ink';
import type React from 'react';
import { type ReactNode, useCallback, useId, useRef } from 'react';
import { useClickable } from '../mouse/useClickable';

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
  const autoId = useId();
  const focusId = id ?? autoId;
  const { isFocused } = useFocus({ autoFocus, id: focusId, isActive: !disabled });

  const toggle = useCallback(() => {
    if (!disabled) {
      onChange(!checked);
    }
  }, [checked, disabled, onChange]);

  useInput(
    (input, key) => {
      if (key.return || input === ' ') {
        toggle();
      }
    },
    { isActive: isFocused && !disabled }
  );

  const ref = useRef<DOMElement>(null);
  useClickable(ref, toggle, !disabled);

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
