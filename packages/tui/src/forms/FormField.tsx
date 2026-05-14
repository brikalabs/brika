/**
 * Declares one step in a form. Carries the field's name, label, and
 * (optional) validator + value summarizer. Renders nothing on its
 * own when it's not the active step — the parent `<Form>` decides
 * which `<FormField>` to mount.
 *
 *   <FormField name="email" label="Email" validate={emailish}>
 *     <FormInput placeholder="ada@example.com" />
 *   </FormField>
 *
 * The child is whichever input primitive the field uses
 * (`<FormInput>`, `<FormPassword>`, `<FormSelect>`, `<FormConfirm>`).
 * Inside the FormField, the input reads `useFormControl()` for its
 * value handle.
 */

import { Box, Text } from 'ink';
import type React from 'react';
import {
  FormControlContext,
  type FormValidator,
  type FormValue,
  useFormField,
} from './useFormContext';

export interface FormFieldProps {
  /** Stable key — used in the values record passed to onSubmit. */
  readonly name: string;
  /** Human label rendered above the input and in the completed-step row. */
  readonly label: string;
  /** Optional sync validator. Return a string to surface, `null` to pass. */
  readonly validate?: FormValidator;
  /** Initial value for the field. Defaults to '' (or false for confirms). */
  readonly initialValue?: FormValue;
  /** Optional override for the compact "✓ Label: …" row's value text. */
  readonly summarize?: (value: FormValue) => string;
  /** The input primitive that captures the value. */
  readonly children: React.ReactNode;
}

export function FormField({ name, label, children }: Readonly<FormFieldProps>): React.ReactElement {
  const handle = useFormField(name, label);
  return (
    <FormControlContext.Provider value={handle}>
      <Box flexDirection="column" paddingLeft={2}>
        <Box>
          <Text color="cyan">│ </Text>
          <Text bold>{label}</Text>
        </Box>
        <Box>
          <Text color="cyan">│ </Text>
          <Box>{children}</Box>
        </Box>
        {handle.error && (
          <Box>
            <Text color="red">│ </Text>
            <Text color="red">{handle.error}</Text>
          </Box>
        )}
      </Box>
    </FormControlContext.Provider>
  );
}
