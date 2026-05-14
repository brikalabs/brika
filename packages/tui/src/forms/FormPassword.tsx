/**
 * Masked text input. Same handle wiring as `<FormInput>`; the rendered
 * value is replaced with bullets. The Form's completed-step summary
 * also masks (`••••••`) unless the field declares a custom `summarize`.
 */

import type React from 'react';
import { TextInput } from './inputs/TextInput';
import { useFormControl } from './useFormContext';

export function FormPassword(): React.ReactElement {
  const field = useFormControl();
  const value = typeof field.value === 'string' ? field.value : '';
  return (
    <TextInput
      value={value}
      onChange={(next) => field.setValue(next)}
      onSubmit={() => field.submit()}
      onCancel={() => field.cancel()}
      mask
      focused
    />
  );
}
