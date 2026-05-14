/**
 * Single-select picker for a `<FormField>`. Arrow-nav between options
 * (with optional hints), Enter submits, Esc cancels via the Form.
 *
 *   <FormField name="role" label="Role">
 *     <FormSelect options={[
 *       { value: 'user', label: 'User', hint: 'regular access' },
 *       { value: 'admin', label: 'Admin', hint: 'full control' },
 *     ]} />
 *   </FormField>
 */

import type React from 'react';
import { SelectInput, type SelectOption } from './inputs/SelectInput';
import { useFormControl } from './useFormContext';

export interface FormSelectProps {
  readonly options: ReadonlyArray<SelectOption>;
}

export function FormSelect({ options }: Readonly<FormSelectProps>): React.ReactElement {
  const field = useFormControl();
  const value = typeof field.value === 'string' ? field.value : undefined;
  return (
    <SelectInput
      options={options}
      value={value}
      onSubmit={(next) => {
        // The select's onSubmit fires when the user hits Enter on a
        // choice; we record AND advance in one go. Threading `next`
        // through `submit()` sidesteps React state batching — the
        // form validates against the picked value, not the stale one
        // in `values[name]`.
        field.submit(next);
      }}
      onCancel={() => field.cancel()}
      focused
    />
  );
}
