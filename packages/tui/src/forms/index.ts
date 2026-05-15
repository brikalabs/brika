/**
 * Composable, shadcn-flavoured form primitives for Ink TUIs.
 *
 *   <Form title="Add user" onSubmit={save} onCancel={close}>
 *     <FormField name="email" label="Email" validate={emailish}>
 *       <FormInput placeholder="ada@example.com" />
 *     </FormField>
 *     <FormField name="role" label="Role">
 *       <FormSelect options={[...]} />
 *     </FormField>
 *     <FormField name="password" label="Password" validate={minLen(8)}>
 *       <FormPassword />
 *     </FormField>
 *   </Form>
 *
 * For ad-hoc text inputs outside a `<Form>`, use the canonical
 * `<Input>` primitive from `@brika/tui` directly. The form text
 * primitives (`<FormInput>`, `<FormPassword>`) are thin wrappers
 * that bridge the field handle to `<Input>` — they don't ship their
 * own keystroke handling any more.
 */

export { Form, type FormProps } from './Form';
export { FormConfirm } from './FormConfirm';
export { FormField, type FormFieldProps } from './FormField';
export { FormInput, type FormInputProps } from './FormInput';
export { FormPassword } from './FormPassword';
export { FormSelect, type FormSelectProps } from './FormSelect';
export { type SelectOption } from './inputs/SelectInput';
export {
  type FormContextValue,
  type FormFieldHandle,
  type FormValidator,
  type FormValue,
  type FormValues,
  useFormContext,
  useFormControl,
  useFormField,
} from './useFormContext';
