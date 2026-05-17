/**
 * Single-select picker for a `<FormField>`. Renders the active option
 * label when blurred, and the full `<SelectInput>` (arrow-nav,
 * Enter advances) when the field is focused.
 *
 *   <FormField name="role" label="Role" initialValue="user">
 *     <FormSelect options={[
 *       { value: 'user', label: 'User', hint: 'regular access' },
 *       { value: 'admin', label: 'Admin', hint: 'full control' },
 *     ]} />
 *   </FormField>
 *
 * Arrow-nav commits the picked value to the form on each move (not
 * only on Enter) — so Tab-ing away mid-pick still records the most
 * recently highlighted choice, mirroring how native form selects work.
 */

import { Text } from 'ink';
import type React from 'react';
import { SelectInput, type SelectOption } from './inputs/SelectInput';
import { useFormControl } from './useFormContext';

export interface FormSelectProps {
  readonly options: ReadonlyArray<SelectOption>;
}

const EMPTY_PLACEHOLDER = '—';

export function FormSelect({ options }: Readonly<FormSelectProps>): React.ReactElement {
  const field = useFormControl();
  const value = typeof field.value === 'string' ? field.value : undefined;

  if (!field.isActive) {
    const option = options.find((o) => o.value === value);
    if (!option) {
      return <Text dimColor>{EMPTY_PLACEHOLDER}</Text>;
    }
    return <Text>{option.label}</Text>;
  }

  return (
    <SelectInput
      options={options}
      value={value}
      onChange={(next) => field.setValue(next)}
      onSubmit={(next) => field.submit(next)}
      onCancel={() => field.cancel()}
      focused
    />
  );
}
