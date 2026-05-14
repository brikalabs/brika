/**
 * Form context — the state every field and input reads from to know
 * its own value, focus, validation error, and how to advance / cancel.
 *
 * Consumers don't construct this manually; the `<Form>` component
 * provides it. Field components read it via `useFormField()` (scoped
 * to their declared `name`), and inputs read it via `useFormControl()`
 * (which delegates to the active field).
 */

import { createContext, useContext } from 'react';

export type FormValue = string | boolean;
export type FormValues = Record<string, FormValue>;
export type FormValidator = (value: FormValue, values: FormValues) => string | null;

/**
 * Per-field handle returned by `useFormField()` and consumed by
 * input primitives via `useFormControl()`. The input writes through
 * `setValue` and calls `submit()` on Enter; the form validates and
 * advances to the next field.
 */
export interface FormFieldHandle {
  readonly name: string;
  readonly label: string;
  readonly value: FormValue;
  readonly error: string | null;
  readonly isActive: boolean;
  readonly setValue: (value: FormValue) => void;
  /**
   * Submit the field, advancing the form if validation passes. Pass
   * an override to avoid the React-state-batching gotcha where
   * `setValue(x); submit();` would otherwise validate the previous
   * value.
   */
  readonly submit: (override?: FormValue) => void;
  readonly cancel: () => void;
}

export interface FormContextValue {
  readonly values: FormValues;
  readonly currentName: string | null;
  readonly errors: Readonly<Record<string, string | null>>;
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
 * Field-scoped handle for a given declared field name. Used by
 * `<FormField>` to render its label + chrome and pass the inner
 * input the value handle.
 */
export function useFormField(name: string, label: string): FormFieldHandle {
  const ctx = useFormContext();
  return {
    name,
    label,
    value: ctx.values[name] ?? '',
    error: ctx.errors[name] ?? null,
    isActive: ctx.currentName === name,
    setValue: (next) => ctx.setValue(name, next),
    submit: (override) => ctx.submitField(name, override),
    cancel: ctx.cancel,
  };
}

/**
 * Active-field handle for inputs. Inputs don't know their own name
 * (their <FormField> parent does), so they ask the form for the
 * *currently active* field. Throws if called outside a FormField
 * tree — that's a configuration error.
 */
export const FormControlContext = createContext<FormFieldHandle | null>(null);

export function useFormControl(): FormFieldHandle {
  const handle = useContext(FormControlContext);
  if (!handle) {
    throw new Error('Form input used outside a <FormField>');
  }
  return handle;
}
