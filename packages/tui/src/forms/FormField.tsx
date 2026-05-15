/**
 * Declares one field in a form. Renders as a single row:
 *
 *   [status] Label: value                     ← when blurred
 *   ▸ Label                                   ← when focused
 *     [editor — Input / Select / Confirm]
 *     red error message (if any)
 *
 * Status icon + colour reflect the live validator result:
 *
 *   ○  empty   — value is blank, no error worth surfacing yet
 *   ✓  valid   — passes the validator
 *   ✗  error   — validator (or server) rejected the current value
 *
 * Focus comes from Ink's native focus manager — Tab / Shift+Tab cycle
 * through every mounted `<FormField>` in render order, plus the
 * Form's built-in Submit button at the end. Clicking anywhere on the
 * row focuses it.
 *
 * `<FormField>` exposes its value handle via `FormControlContext`,
 * which the inner input primitive reads with `useFormControl()`.
 * That input is responsible for rendering BOTH editor (when
 * `handle.isActive`) and blurred display (when not) — so password
 * fields auto-mask, selects show their option label, etc. The Form
 * doesn't need a `summarize` escape hatch any more.
 */

import { Box, type DOMElement, Text, useFocus, useFocusManager } from 'ink';
import type React from 'react';
import { type ReactNode, useCallback, useRef } from 'react';
import { hitTest, useBounds } from '../mouse/useBounds';
import { useMouse } from '../mouse/useMouse';
import {
  type FieldStatus,
  FormControlContext,
  type FormValidator,
  type FormValue,
  useFormField,
} from './useFormContext';

export interface FormFieldProps {
  /** Stable key — used in the values record passed to `onSubmit`. */
  readonly name: string;
  /** Human label rendered before the value / editor. */
  readonly label: string;
  /** Sync validator. Return `null` to pass; a string surfaces under
   *  the editor and flips the row's status icon to red. */
  readonly validate?: FormValidator;
  /** Initial value when the form mounts. Defaults to `''`. */
  readonly initialValue?: FormValue;
  /** The input primitive that captures the value. */
  readonly children: ReactNode;
}

interface StatusStyle {
  readonly glyph: string;
  readonly color: string;
}

const STATUS_STYLE: Readonly<Record<FieldStatus, StatusStyle>> = {
  empty: { glyph: '○', color: 'gray' },
  valid: { glyph: '✓', color: 'green' },
  error: { glyph: '✗', color: 'red' },
};

export function FormField({ name, label, children }: Readonly<FormFieldProps>): React.ReactElement {
  const fieldId = `formfield:${name}`;
  const { isFocused } = useFocus({ id: fieldId });
  const { focus } = useFocusManager();
  const boxRef = useRef<DOMElement>(null);
  const bounds = useBounds(boxRef);

  // The row's own focus state IS the canonical "active" signal —
  // pass it straight into the handle so the wrapper's compact/edit
  // decision and the row's own layout decision never disagree.
  const handle = useFormField(name, label, isFocused);

  // Mouse: click anywhere on the row focuses it.
  const handleMouse = useCallback(
    (e: { action: string; button: string; column: number; row: number }) => {
      if (e.button !== 'left' || e.action !== 'down' || !bounds) {
        return;
      }
      if (hitTest(bounds, e)) {
        focus(fieldId);
      }
    },
    [bounds, focus, fieldId]
  );
  useMouse(handleMouse);

  const style = STATUS_STYLE[handle.status];

  return (
    <FormControlContext.Provider value={handle}>
      <Box ref={boxRef} flexDirection="column">
        <Box>
          <Text color={style.color}>{style.glyph}</Text>
          <Text> </Text>
          <Text bold={isFocused}>{label}</Text>
          {!isFocused && (
            <>
              <Text dimColor>: </Text>
              <Box>{children}</Box>
            </>
          )}
        </Box>
        {isFocused && (
          <Box flexDirection="column" paddingLeft={2}>
            <Box>{children}</Box>
            {handle.error && (
              <Box>
                <Text color="red">{handle.error}</Text>
              </Box>
            )}
          </Box>
        )}
      </Box>
    </FormControlContext.Provider>
  );
}
