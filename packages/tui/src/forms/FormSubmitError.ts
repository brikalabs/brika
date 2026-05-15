/**
 * Throw a `FormSubmitError` from a Form's `onSubmit` to surface
 * server-side problems back into the UI without dismissing the form:
 *
 *   onSubmit={async (values) => {
 *     const res = await fetch('/api/users', { ... });
 *     if (res.status === 409) {
 *       throw new FormSubmitError('could not add user', {
 *         fields: { email: 'already in use' },
 *       });
 *     }
 *     if (!res.ok) throw new Error(await res.text());
 *   }}
 *
 *   ✗ Email: ada@example.com   ← red, with "already in use" under it
 *   …
 *   ✗ could not add user        ← form-level banner
 *
 * Any other thrown error becomes a generic form-level error.
 *
 * Per-field server errors clear automatically when the user starts
 * editing that field again, so the user always sees the most recent
 * truth (either the validator's verdict or the server's).
 */

export interface FormSubmitErrorOptions {
  /** Field-keyed error messages — keys must match `<FormField name>`. */
  readonly fields?: Readonly<Record<string, string>>;
}

export class FormSubmitError extends Error {
  readonly fields: Readonly<Record<string, string>>;

  constructor(message: string, options: Readonly<FormSubmitErrorOptions> = {}) {
    super(message);
    this.name = 'FormSubmitError';
    this.fields = options.fields ?? {};
  }
}
