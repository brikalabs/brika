/**
 * Arrow-nav single-select. One option per line, the focused one
 * marked with `◆`. Enter submits, Esc cancels.
 *
 * Always renders its own `useInput`; pass `focused={false}` to
 * suspend keyboard handling without unmounting (so a parent wizard
 * can step through fields cleanly).
 *
 * Each row is also mouse-clickable: a single click highlights AND
 * submits the option, same as Enter on the keyboard. Builds on the
 * shared `useClickable` engine so nested clickables resolve to the
 * innermost target automatically.
 */

import { Box, type DOMElement, Text, useInput } from 'ink';
import type React from 'react';
import { useRef, useState } from 'react';
import { useClickable } from '../../mouse/useClickable';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly hint?: string;
}

export interface SelectInputProps {
  readonly options: ReadonlyArray<SelectOption>;
  readonly value?: string;
  /** Fires on each arrow-nav move with the newly highlighted value.
   *  Forms wire this to commit-on-navigation so Tab-ing away mid-pick
   *  still records the most recent selection. */
  readonly onChange?: (value: string) => void;
  readonly onSubmit?: (value: string) => void;
  readonly onCancel?: () => void;
  readonly focused?: boolean;
}

export function SelectInput({
  options,
  value,
  onChange,
  onSubmit,
  onCancel,
  focused = true,
}: Readonly<SelectInputProps>): React.ReactElement {
  const initial = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  const [index, setIndex] = useState(initial);
  const current = options[index] ?? options[0];

  const move = (delta: number): void => {
    const next = (index + delta + options.length) % options.length;
    setIndex(next);
    const picked = options[next];
    if (picked) {
      onChange?.(picked.value);
    }
  };

  const pick = (i: number): void => {
    setIndex(i);
    const opt = options[i];
    if (opt) {
      onChange?.(opt.value);
      onSubmit?.(opt.value);
    }
  };

  useInput(
    (_input, key) => {
      if (key.escape) {
        onCancel?.();
        return;
      }
      if (key.return) {
        if (current) {
          onSubmit?.(current.value);
        }
        return;
      }
      if (key.upArrow) {
        move(-1);
        return;
      }
      if (key.downArrow) {
        move(1);
      }
    },
    { isActive: focused }
  );

  return (
    <Box flexDirection="column">
      {options.map((opt, i) => (
        <SelectRow key={opt.value} option={opt} active={i === index} onPress={() => pick(i)} />
      ))}
    </Box>
  );
}

interface SelectRowProps {
  readonly option: SelectOption;
  readonly active: boolean;
  readonly onPress: () => void;
}

function SelectRow({ option, active, onPress }: Readonly<SelectRowProps>): React.ReactElement {
  const ref = useRef<DOMElement>(null);
  useClickable(ref, onPress);
  return (
    <Box ref={ref}>
      <Text color={active ? 'cyan' : 'gray'}>{active ? '◆ ' : '○ '}</Text>
      <Text color={active ? 'cyan' : undefined} bold={active}>
        {option.label}
      </Text>
      {option.hint && <Text dimColor> {option.hint}</Text>}
    </Box>
  );
}
