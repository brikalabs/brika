/**
 * Yes/no confirmation for a `<FormField>`. `y`/`n` or arrow keys
 * toggle, Enter submits, Esc cancels via the Form.
 *
 *   <FormField name="continue" label="Proceed?" initialValue={true}>
 *     <FormConfirm />
 *   </FormField>
 */

import type React from 'react';
import { ConfirmInput } from './inputs/ConfirmInput';
import { useFormControl } from './useFormContext';

export function FormConfirm(): React.ReactElement {
  const field = useFormControl();
  const value = typeof field.value === 'boolean' ? field.value : true;
  return (
    <ConfirmInput
      value={value}
      onSubmit={(next) => {
        // Same batching dodge as FormSelect — thread the picked
        // value straight through so validation sees it.
        field.submit(next);
      }}
      onCancel={() => field.cancel()}
      focused
    />
  );
}
