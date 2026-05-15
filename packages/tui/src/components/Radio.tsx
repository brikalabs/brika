/**
 * `<RadioGroup>` + `<Radio>` — exclusive-choice picker. Like
 * shadcn's `RadioGroup`, but laid out for a terminal.
 *
 *   <RadioGroup value={role} onChange={setRole}>
 *     <Radio value="user">User</Radio>
 *     <Radio value="admin">Admin</Radio>
 *   </RadioGroup>
 *
 *   →  (•) User
 *      ( ) Admin
 *
 * Activation:
 *   - **Mouse**     — click any row to select it.
 *   - **Keyboard**  — `↑` / `↓` move the selection, `Space` / `Enter`
 *     also commits the highlighted value.
 *
 * The group is keyboard-active when any of its `<Radio>` rows holds
 * focus (Tab cycle). Mouse clicks bypass focus entirely — they fire
 * `onChange` without the row needing to be focused first.
 *
 * `value` is controlled; pair with `onChange`. If you want a free-
 * floating uncontrolled variant, wrap with your own `useState`.
 */

import { Box, type DOMElement, Text, useFocus, useInput } from 'ink';
import type React from 'react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useClickable } from '../mouse/useClickable';

interface RadioEntry {
  readonly value: string;
}

interface RadioGroupContextValue {
  readonly value: string | null;
  readonly select: (v: string) => void;
  readonly register: (entry: RadioEntry) => () => void;
  readonly items: ReadonlyArray<RadioEntry>;
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

function useRadioGroupContext(component: string): RadioGroupContextValue {
  const ctx = useContext(RadioGroupContext);
  if (!ctx) {
    throw new Error(`<${component}> must be rendered inside a <RadioGroup>`);
  }
  return ctx;
}

export interface RadioGroupProps {
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onChange?: (value: string) => void;
  readonly children?: ReactNode;
}

export function RadioGroup({
  value,
  defaultValue,
  onChange,
  children,
}: Readonly<RadioGroupProps>): React.ReactElement {
  const [internal, setInternal] = useState<string | null>(defaultValue ?? null);
  const [items, setItems] = useState<ReadonlyArray<RadioEntry>>([]);
  const current = value ?? internal;

  const select = useCallback(
    (v: string) => {
      if (value === undefined) {
        setInternal(v);
      }
      onChange?.(v);
    },
    [value, onChange]
  );

  const register = useCallback((entry: RadioEntry): (() => void) => {
    setItems((prev) => (prev.some((it) => it.value === entry.value) ? prev : [...prev, entry]));
    const isOther = (it: RadioEntry): boolean => it.value !== entry.value;
    return () => setItems((prev) => prev.filter(isOther));
  }, []);

  const ctx = useMemo<RadioGroupContextValue>(
    () => ({ value: current, select, register, items }),
    [current, select, register, items]
  );

  return (
    <RadioGroupContext.Provider value={ctx}>
      <Box flexDirection="column">{children}</Box>
    </RadioGroupContext.Provider>
  );
}

export interface RadioProps {
  readonly value: string;
  readonly disabled?: boolean;
  readonly children?: ReactNode;
}

export function Radio({
  value,
  disabled = false,
  children,
}: Readonly<RadioProps>): React.ReactElement {
  const ctx = useRadioGroupContext('Radio');
  const { value: selected, select, register, items } = ctx;
  const focusId = useId();
  const { isFocused } = useFocus({ id: focusId, isActive: !disabled });

  useEffect(() => register({ value }), [register, value]);

  // Arrow nav: only the focused radio's `useInput` is active, so we
  // only need to wire keys here — no group-level dispatcher.
  const move = useCallback(
    (delta: number) => {
      if (items.length === 0) {
        return;
      }
      const idx = items.findIndex((it) => it.value === value);
      const next = items[(idx + delta + items.length) % items.length];
      if (next) {
        select(next.value);
      }
    },
    [items, value, select]
  );

  useInput(
    (input, key) => {
      if (key.upArrow) {
        move(-1);
        return;
      }
      if (key.downArrow) {
        move(1);
        return;
      }
      if (key.return || input === ' ') {
        select(value);
      }
    },
    { isActive: isFocused && !disabled }
  );

  const ref = useRef<DOMElement>(null);
  useClickable(ref, () => select(value), !disabled);

  const checked = selected === value;
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
      <Text color={checked && !disabled ? accent : undefined} dimColor={disabled}>
        ({checked ? '•' : ' '})
      </Text>
      <Text color={checked && !disabled ? accent : undefined} bold={checked} dimColor={disabled}>
        {' '}
        {children}
      </Text>
    </Box>
  );
}
