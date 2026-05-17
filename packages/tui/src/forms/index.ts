/**
 * Composable, shadcn-flavoured form primitives for Ink TUIs.
 *
 *   <Form title="Add user" onSubmit={save} onCancel={close}>
 *     <FormField name="email" label="Email" validate={compose(required(), email())}>
 *       <FormInput placeholder="ada@example.com" />
 *     </FormField>
 *     <FormField name="role" label="Role" initialValue="user">
 *       <FormSelect options={[...]} />
 *     </FormField>
 *     <FormField name="password" label="Password" validate={minLength(8)}>
 *       <FormPassword />
 *     </FormField>
 *   </Form>
 *
 * All `<FormField>`s render at once; only the focused field expands
 * its editor. Tab / Shift+Tab cycle. Live validation surfaces three
 * statuses (`empty` / `valid` / `error`) as inline icons.
 *
 * Throw `FormSubmitError` from `onSubmit` to surface server-side
 * field errors back into the form (e.g. "email already in use") —
 * see its module for usage.
 *
 * For ad-hoc text inputs outside a `<Form>`, use the canonical
 * `<Input>` primitive from `@brika/tui` directly.
 */

export { Form, type FormProps } from './Form';
export { FormConfirm } from './FormConfirm';
export { FormField, type FormFieldProps } from './FormField';
export { FormInput, type FormInputProps } from './FormInput';
export { FormPassword } from './FormPassword';
export { FormSelect, type FormSelectProps } from './FormSelect';
export { FormSubmitError, type FormSubmitErrorOptions } from './FormSubmitError';
export { type SelectOption } from './inputs/SelectInput';
export {
  type FieldStatus,
  type FormContextValue,
  type FormFieldHandle,
  type FormValidator,
  type FormValue,
  type FormValues,
  useFormContext,
  useFormControl,
  useFormField,
} from './useFormContext';
export { check, compose, email, maxLength, minLength, required } from './validators';
