/**
 * Form context — the state every field and input reads from to know
 * its own value, focus, validation status, and how to advance /
 * cancel / submit.
 *
 * Consumers don't construct this manually; `<Form>` provides it.
 * Field rows read it via `useFormField(name, label)` (which adds the
 * row's focus state to the handle), and inputs read the *active*
 * handle via `useFormControl()` from inside a `<FormField>` tree.
 */

import { createContext, useContext } from 'react';

export type FormValue = string | boolean;
export type FormValues = Record<string, FormValue>;
export type FormValidator = (value: FormValue, values: FormValues) => string | null;

/** Visual state for a field: `empty` → no value yet; `valid` → has
 *  value & passes validator; `error` → validator (or server) rejected. */
export type FieldStatus = 'empty' | 'valid' | 'error';

/**
 * Per-field handle returned by `useFormField()` and consumed by
 * input primitives via `useFormControl()`.
 */
export interface FormFieldHandle {
  readonly name: string;
  readonly label: string;
  readonly value: FormValue;
  readonly error: string | null;
  readonly status: FieldStatus;
  /** True when this field's row currently owns keyboard focus. The
   *  input wrapper renders an editor when active, a value summary
   *  when not. */
  readonly isActive: boolean;
  readonly setValue: (value: FormValue) => void;
  /**
   * Validate-then-advance. Pass an override to dodge React's setState
   * batching (so the form validates the freshly-picked value rather
   * than the previous one). Errors stay on the same field; success
   * moves focus to the next focusable element.
   */
  readonly submit: (override?: FormValue) => void;
  readonly cancel: () => void;
}

export interface FormContextValue {
  readonly values: FormValues;
  readonly errors: Readonly<Record<string, string | null>>;
  readonly statuses: Readonly<Record<string, FieldStatus>>;
  readonly setValue: (name: string, value: FormValue) => void;
  readonly submitField: (name: string, override?: FormValue) => void;
  readonly cancel: () => void;
}

export const FormContext = createContext<FormContextValue | null>(null);

export function useFormContext(): FormContextValue {
  const ctx = useContext(FormContext);
  if (!ctx) {
    throw new Error('useFormContext() called outside <Form>');
  }
  return ctx;
}

/**
 * Field-scoped handle for a given declared field name. `<FormField>`
 * calls this with its locally-tracked `isActive` (the row's
 * `useFocus.isFocused`) so the handle and the row's render decision
 * always agree — no one-frame mismatch during Tab transitions.
 */
export function useFormField(name: string, label: string, isActive: boolean): FormFieldHandle {
  const ctx = useFormContext();
  return {
    name,
    label,
    value: ctx.values?.[name] ?? '',
    error: ctx.errors?.[name] ?? null,
    status: ctx.statuses?.[name] ?? 'empty',
    isActive,
    setValue: (next) => ctx.setValue(name, next),
    submit: (override) => ctx.submitField(name, override),
    cancel: ctx.cancel,
  };
}

/**
 * Active-field handle for inputs. Inputs don't know their own name
 * (their `<FormField>` parent does), so they pull the field-scoped
 * handle from this context.
 */
export const FormControlContext = createContext<FormFieldHandle | null>(null);

export function useFormControl(): FormFieldHandle {
  const handle = useContext(FormControlContext);
  if (!handle) {
    throw new Error('Form input used outside a <FormField>');
  }
  return handle;
}
