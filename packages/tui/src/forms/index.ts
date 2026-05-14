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
 * Forms automatically call `useCaptureInput()` so global hotkeys
 * (registered via `useKey`) suspend while the form has focus. Add
 * `enabled={!isInputCaptured}` to your global bindings.
 *
 * For ad-hoc usage outside a `<Form>` (e.g. a non-step text prompt),
 * import the raw input primitives — `TextInput`, `SelectInput`,
 * `ConfirmInput` — directly.
 */

export { Form, type FormProps } from './Form';
export { FormConfirm } from './FormConfirm';
export { FormField, type FormFieldProps } from './FormField';
export { FormInput, type FormInputProps } from './FormInput';
export { FormPassword } from './FormPassword';
export { FormSelect, type FormSelectProps } from './FormSelect';
export {
  ConfirmInput,
  type ConfirmInputProps,
} from './inputs/ConfirmInput';
export {
  SelectInput,
  type SelectInputProps,
  type SelectOption,
} from './inputs/SelectInput';
export { TextInput, type TextInputProps } from './inputs/TextInput';
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
