/**
 * Single-line text input for a `<FormField>`. Bridges the field's
 * value handle to the canonical `<Input>` primitive — no duplicate
 * keystroke handling, no separate caret, no separate focus
 * behaviour. The Form mounts one field at a time so `autoFocus`
 * stays `true` here.
 *
 *   <FormField name="name" label="Full name">
 *     <FormInput placeholder="Ada Lovelace" />
 *   </FormField>
 */

import type React from 'react';
import { Input, type InputType } from '../components/Input';
import { useFormControl } from './useFormContext';

export interface FormInputProps {
  readonly placeholder?: string;
  /** Passed through to `<Input type=…>`. Default `'text'`. */
  readonly type?: InputType;
}

export function FormInput({
  placeholder,
  type = 'text',
}: Readonly<FormInputProps>): React.ReactElement {
  const field = useFormControl();
  const value = typeof field.value === 'string' ? field.value : '';
  return (
    <Input
      type={type}
      value={value}
      onChange={(next) => field.setValue(next)}
      onSubmit={() => field.submit()}
      onCancel={() => field.cancel()}
      placeholder={placeholder}
    />
  );
}
