/**
 * Single-line text input for a `<FormField>`. Reads its value handle
 * from `useFormControl()` — no prop drilling — and is auto-focused
 * because the parent Form only mounts the active field.
 *
 *   <FormField name="name" label="Full name">
 *     <FormInput placeholder="Ada Lovelace" />
 *   </FormField>
 */

import type React from 'react';
import { TextInput } from './inputs/TextInput';
import { useFormControl } from './useFormContext';

export interface FormInputProps {
  readonly placeholder?: string;
}

export function FormInput({ placeholder }: Readonly<FormInputProps>): React.ReactElement {
  const field = useFormControl();
  const value = typeof field.value === 'string' ? field.value : '';
  return (
    <TextInput
      value={value}
      onChange={(next) => field.setValue(next)}
      onSubmit={() => field.submit()}
      onCancel={() => field.cancel()}
      placeholder={placeholder}
      focused
    />
  );
}
