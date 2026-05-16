import {
  compose,
  email,
  Form,
  FormField,
  FormInput,
  FormPassword,
  FormSelect,
  type FormValues,
  minLength,
  required,
} from '@brika/tui';
import type React from 'react';
import { postUser } from './postUser';

export { postUser };

const ROLE_OPTIONS = [
  { value: 'user', label: 'User', hint: 'regular access' },
  { value: 'admin', label: 'Admin', hint: 'full control' },
];

interface AddUserFormProps {
  readonly onSubmit: (values: FormValues) => Promise<void>;
  readonly onCancel: () => void;
}

export function AddUserForm({ onSubmit, onCancel }: Readonly<AddUserFormProps>): React.ReactElement {
  return (
    <Form title="Add user" subtitle="Esc to cancel any step" onSubmit={onSubmit} onCancel={onCancel}>
      <FormField name="name" label="Full name" validate={required()}>
        <FormInput placeholder="Ada Lovelace" />
      </FormField>
      <FormField name="email" label="Email" validate={compose(required(), email())}>
        <FormInput placeholder="ada@example.com" />
      </FormField>
      <FormField name="role" label="Role" initialValue="user">
        <FormSelect options={ROLE_OPTIONS} />
      </FormField>
      <FormField name="password" label="Password" validate={compose(required(), minLength(8))}>
        <FormPassword />
      </FormField>
    </Form>
  );
}
