/**
 * Masked text input for a `<FormField>` — `<FormInput type="password">`
 * with a shorter name for the call site. Renders bullets via the
 * canonical `<Input>` primitive; the Form's completed-step summary
 * also masks (`••••••`) unless the field declares a custom
 * `summarize`.
 */

import type React from 'react';
import { FormInput } from './FormInput';

export function FormPassword(): React.ReactElement {
  return <FormInput type="password" />;
}
