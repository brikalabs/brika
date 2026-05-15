/**
 * Reusable form validators. Each helper returns a `FormValidator`
 * — the same `(value, values) => string | null` shape a `<FormField>`
 * accepts — so consumers can drop them in directly:
 *
 *   <FormField name="email" label="Email" validate={email()}>
 *     <FormInput />
 *   </FormField>
 *
 *   <FormField
 *     name="password"
 *     label="Password"
 *     validate={compose(required(), minLength(8))}
 *   >
 *     <FormPassword />
 *   </FormField>
 *
 * Messages default to short, lowercase phrases consistent with the
 * rest of the TUI; pass a custom string to override.
 */

import type { FormValidator } from './useFormContext';

const isString = (v: unknown): v is string => typeof v === 'string';

/** Fails on `''` (string), `undefined`, or `false` (Confirm field). */
export function required(message = 'this field is required'): FormValidator {
  return (value) => {
    if (value === undefined) {
      return message;
    }
    if (isString(value) && value.trim().length === 0) {
      return message;
    }
    if (value === false) {
      return message;
    }
    return null;
  };
}

/** Minimum string length. No-op on empty values — chain with `required()`
 *  if the field must also be non-empty. */
export function minLength(n: number, message?: string): FormValidator {
  const msg = message ?? `must be at least ${n} characters`;
  return (value) => {
    if (!isString(value) || value.length === 0) {
      return null;
    }
    return value.length < n ? msg : null;
  };
}

/** Maximum string length. */
export function maxLength(n: number, message?: string): FormValidator {
  const msg = message ?? `must be at most ${n} characters`;
  return (value) => {
    if (!isString(value)) {
      return null;
    }
    return value.length > n ? msg : null;
  };
}

/**
 * Loose `local@host.tld` shape check. Plain string scan — no regex —
 * so there's no ReDoS surface (Sonar S5852 false-positive trap).
 */
export function email(message = 'enter a valid email'): FormValidator {
  return (value) => {
    if (!isString(value) || value.length === 0) {
      return null;
    }
    if (value.includes(' ')) {
      return message;
    }
    const at = value.indexOf('@');
    if (at <= 0 || at !== value.lastIndexOf('@')) {
      return message;
    }
    const domain = value.slice(at + 1);
    const dot = domain.indexOf('.');
    return dot > 0 && dot < domain.length - 1 ? null : message;
  };
}

/** Escape hatch for arbitrary checks — passes when `predicate` is true. */
export function check(predicate: (value: string) => boolean, message: string): FormValidator {
  return (value) => {
    if (!isString(value) || value.length === 0) {
      return null;
    }
    return predicate(value) ? null : message;
  };
}

/** Run validators in order, returning the first failure (short-circuit). */
export function compose(...validators: ReadonlyArray<FormValidator>): FormValidator {
  return (value, values) => {
    for (const v of validators) {
      const result = v(value, values);
      if (result !== null) {
        return result;
      }
    }
    return null;
  };
}
