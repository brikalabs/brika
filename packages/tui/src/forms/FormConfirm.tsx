/**
 * Yes/no confirmation for a `<FormField>`. Renders `yes`/`no` text
 * when blurred and the full `<ConfirmInput>` (y/n keys, arrow toggle,
 * Enter advances) when focused.
 *
 *   <FormField name="continue" label="Proceed?" initialValue={true}>
 *     <FormConfirm />
 *   </FormField>
 */

import { Text } from 'ink';
import type React from 'react';
import { ConfirmInput } from './inputs/ConfirmInput';
import { useFormControl } from './useFormContext';

export function FormConfirm(): React.ReactElement {
  const field = useFormControl();
  const value = typeof field.value === 'boolean' ? field.value : true;

  if (!field.isActive) {
    return <Text>{value ? 'yes' : 'no'}</Text>;
  }

  return (
    <ConfirmInput
      value={value}
      onChange={(next) => field.setValue(next)}
      onSubmit={(next) => field.submit(next)}
      onCancel={() => field.cancel()}
      focused
    />
  );
}
