/**
 * Single-line text input for a `<FormField>`. Bridges the field's
 * value handle to the canonical `<Input>` primitive when the field
 * is focused; renders a dim compact value when blurred.
 *
 *   <FormField name="name" label="Full name" validate={required()}>
 *     <FormInput placeholder="Ada Lovelace" />
 *   </FormField>
 *
 * Password masking is automatic: `<FormInput type="password" />` (or
 * the `<FormPassword>` alias) hides characters in the editor and in
 * the blurred display.
 */

import { Text } from 'ink';
import type React from 'react';
import { Input, type InputType } from '../components/Input';
import { useFormControl } from './useFormContext';

export interface FormInputProps {
  readonly placeholder?: string;
  /** Passed through to `<Input type=…>`. Default `'text'`. */
  readonly type?: InputType;
}

const EMPTY_PLACEHOLDER = '—';

export function FormInput({
  placeholder,
  type = 'text',
}: Readonly<FormInputProps>): React.ReactElement {
  const field = useFormControl();
  const value = typeof field.value === 'string' ? field.value : '';

  if (!field.isActive) {
    if (value.length === 0) {
      return <Text dimColor>{EMPTY_PLACEHOLDER}</Text>;
    }
    if (type === 'password') {
      return <Text>{'•'.repeat(value.length)}</Text>;
    }
    return <Text>{value}</Text>;
  }

  return (
    <Input
      type={type}
      value={value}
      onChange={(next) => field.setValue(next)}
      onSubmit={() => field.submit()}
      onCancel={() => field.cancel()}
      placeholder={placeholder}
      focused
      flex
      border={false}
    />
  );
}
