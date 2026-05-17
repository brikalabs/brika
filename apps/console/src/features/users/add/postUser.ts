import { FormSubmitError, type FormValues } from '@brika/tui';
import { hubFetch } from '../../../shared/cli/hub-client';

export async function postUser(values: FormValues): Promise<void> {
  const res = await hubFetch('/api/users', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(values),
  });
  if (res.ok) {
    return;
  }
  const body = await res.text();
  // Map known server failures onto the offending field so the form
  // keeps the entered values and highlights the row that needs fixing.
  if (res.status === 409) {
    throw new FormSubmitError('could not add user', {
      fields: { email: 'already in use' },
    });
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error('admin login required');
  }
  throw new Error(`${res.status} ${body}`);
}
