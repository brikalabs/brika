/**
 * Multi-field form composed via children. All fields render at once;
 * the focused field expands its editor in place, the rest collapse
 * to a compact `[status] Label: value` row. Tab / Shift+Tab cycle
 * through the fields and the trailing Submit button.
 *
 *   <Form
 *     title="Add user"
 *     onSubmit={async (values) => {
 *       const res = await api.create(values);
 *       if (res.status === 409) {
 *         throw new FormSubmitError('could not add user', {
 *           fields: { email: 'already in use' },
 *         });
 *       }
 *       if (!res.ok) throw new Error(await res.text());
 *     }}
 *     onCancel={onClose}
 *   >
 *     <FormField name="name" label="Full name" validate={required()}>
 *       <FormInput placeholder="Ada Lovelace" />
 *     </FormField>
 *     <FormField name="email" label="Email" validate={compose(required(), email())}>
 *       <FormInput placeholder="ada@example.com" />
 *     </FormField>
 *     <FormField name="role" label="Role" initialValue="user">
 *       <FormSelect options={ROLE_OPTIONS} />
 *     </FormField>
 *     <FormField name="password" label="Password" validate={minLength(8)}>
 *       <FormPassword />
 *     </FormField>
 *   </Form>
 *
 * The Form owns:
 *   - the values record, validation status, and per-field errors
 *     (validator + server-side, merged)
 *   - the touched bitmap (errors stay quiet until a field has been
 *     edited or the user attempts to submit)
 *   - submission state (idle / submitting / submitError / done) and
 *     wiring `FormSubmitError.fields` back onto specific rows
 *
 * Throw `FormSubmitError` from `onSubmit` for structured field
 * errors; any other thrown error becomes a generic form-level
 * banner. Per-field server errors clear automatically when the user
 * starts editing that field again — the validator takes over.
 *
 * Esc fires `onCancel` from anywhere inside the form. While mounted
 * the form calls `useCaptureInput()` so global shortcuts (s, x, r,
 * …) stay quiet during typing.
 */

import { Box, type DOMElement, Text, useFocus, useFocusManager, useInput } from 'ink';
import React, { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hitTest, useBounds } from '../mouse/useBounds';
import { useMouse } from '../mouse/useMouse';
import { useCaptureInput } from '../shell/useTuiShell';
import { FormField, type FormFieldProps } from './FormField';
import { FormSubmitError } from './FormSubmitError';
import {
  type FieldStatus,
  FormContext,
  type FormContextValue,
  type FormValidator,
  type FormValue,
  type FormValues,
} from './useFormContext';

export interface FormProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly onSubmit: (values: FormValues) => void | Promise<void>;
  readonly onCancel?: () => void;
  /** Button label rendered at the end of the form. Default `Submit`. */
  readonly submitLabel?: string;
  readonly children: ReactNode;
}

interface FieldDescriptor {
  readonly props: FormFieldProps;
}

function collectFields(children: ReactNode): FieldDescriptor[] {
  const out: FieldDescriptor[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<FormFieldProps>(child)) {
      return;
    }
    if (child.type !== FormField) {
      return;
    }
    out.push({ props: child.props });
  });
  return out;
}

function initialValues(fields: ReadonlyArray<FieldDescriptor>): FormValues {
  const out: FormValues = {};
  for (const field of fields) {
    out[field.props.name] = field.props.initialValue ?? '';
  }
  return out;
}

function isEmptyValue(v: FormValue | undefined): boolean {
  if (v === undefined) {
    return true;
  }
  if (typeof v === 'string') {
    return v.length === 0;
  }
  return false;
}

function computeStatus(
  value: FormValue | undefined,
  validator: FormValidator | undefined,
  values: FormValues,
  touched: boolean,
  serverError: string | null
): FieldStatus {
  const empty = isEmptyValue(value);
  if (serverError) {
    return 'error';
  }
  if (validator) {
    const err = validator(value ?? '', values);
    if (err) {
      // Hide required-style errors on pristine empty fields so the
      // form doesn't shout at the user the moment they open it.
      return empty && !touched ? 'empty' : 'error';
    }
  }
  return empty ? 'empty' : 'valid';
}

export function Form({
  title,
  subtitle,
  onSubmit,
  onCancel,
  submitLabel = 'Submit',
  children,
}: Readonly<FormProps>): React.ReactElement {
  useCaptureInput();

  const fields = useMemo(() => collectFields(children), [children]);

  const [values, setValues] = useState<FormValues>(() => initialValues(fields));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const { focus, focusNext } = useFocusManager();

  // Auto-focus the first field as soon as one is registered. A ref
  // gates the call so it fires exactly once, even if `fields` mutates
  // later (e.g. children load asynchronously after the first render).
  const didAutoFocus = useRef(false);
  useEffect(() => {
    if (didAutoFocus.current) {
      return;
    }
    const first = fields[0]?.props.name;
    if (first) {
      didAutoFocus.current = true;
      focus(`formfield:${first}`);
    }
  }, [fields, focus]);

  const statuses = useMemo<Readonly<Record<string, FieldStatus>>>(() => {
    const out: Record<string, FieldStatus> = {};
    for (const f of fields) {
      out[f.props.name] = computeStatus(
        values[f.props.name],
        f.props.validate,
        values,
        Boolean(touched[f.props.name]),
        serverErrors[f.props.name] ?? null
      );
    }
    return out;
  }, [fields, values, touched, serverErrors]);

  const errors = useMemo<Readonly<Record<string, string | null>>>(() => {
    const out: Record<string, string | null> = {};
    for (const f of fields) {
      const name = f.props.name;
      const server = serverErrors[name];
      if (server) {
        out[name] = server;
        continue;
      }
      if (statuses[name] === 'error' && f.props.validate) {
        out[name] = f.props.validate(values[name] ?? '', values);
        continue;
      }
      out[name] = null;
    }
    return out;
  }, [fields, statuses, values, serverErrors]);

  const allValid = useMemo(() => {
    return fields.every((f) => {
      if (!f.props.validate) {
        return true;
      }
      return f.props.validate(values[f.props.name] ?? '', values) === null;
    });
  }, [fields, values]);

  const setValue = useCallback((name: string, next: FormValue) => {
    setValues((prev) => ({ ...prev, [name]: next }));
    setTouched((prev) => (prev[name] ? prev : { ...prev, [name]: true }));
    // Editing clears the server error for that field — the user is
    // fixing it, so the validator's verdict is now the source of truth.
    setServerErrors((prev) => {
      if (!prev[name]) {
        return prev;
      }
      const { [name]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const submitField = useCallback(
    (name: string, override?: FormValue) => {
      const field = fields.find((f) => f.props.name === name);
      if (!field) {
        return;
      }
      const value: FormValue = override ?? values[name] ?? '';
      const nextValues = override === undefined ? values : { ...values, [name]: override };
      if (override !== undefined) {
        setValues(nextValues);
      }
      setTouched((prev) => (prev[name] ? prev : { ...prev, [name]: true }));
      const err = field.props.validate?.(value, nextValues) ?? null;
      if (err !== null) {
        return;
      }
      focusNext();
    },
    [fields, values, focusNext]
  );

  const submitForm = useCallback(async () => {
    // Touch all fields so any remaining validator errors surface.
    setTouched(Object.fromEntries(fields.map((f) => [f.props.name, true])));
    if (!allValid || submitting) {
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setServerErrors({});
    try {
      await onSubmit(values);
      setDone(true);
    } catch (e) {
      if (e instanceof FormSubmitError) {
        setServerErrors({ ...e.fields });
        setSubmitError(e.message || null);
        // Focus the first server-flagged field so the user sees the
        // problem immediately.
        const firstBad = fields.find((f) => Boolean(e.fields[f.props.name]));
        if (firstBad) {
          focus(`formfield:${firstBad.props.name}`);
        }
      } else {
        setSubmitError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setSubmitting(false);
    }
  }, [allValid, fields, focus, onSubmit, submitting, values]);

  const cancel = useCallback(() => onCancel?.(), [onCancel]);

  // Esc cancels from anywhere — including the Submit button row, where
  // no inner Input would otherwise see the keystroke.
  useInput((_input, key) => {
    if (key.escape) {
      cancel();
    }
  });

  const ctxValue = useMemo<FormContextValue>(
    () => ({
      values,
      errors,
      statuses,
      setValue,
      submitField,
      cancel,
    }),
    [values, errors, statuses, setValue, submitField, cancel]
  );

  return (
    <FormContext.Provider value={ctxValue}>
      <Box flexDirection="column">
        <Header title={title} subtitle={subtitle} />
        {done ? (
          <DoneRow error={submitError} />
        ) : (
          <>
            <Box flexDirection="column" paddingLeft={2}>
              {children}
            </Box>
            {submitError && (
              <Box paddingLeft={2} marginTop={1}>
                <Text color="red">✗ {submitError}</Text>
              </Box>
            )}
            <Box paddingLeft={2} marginTop={1}>
              <SubmitButton
                label={submitLabel}
                enabled={allValid && !submitting}
                submitting={submitting}
                onPress={submitForm}
              />
            </Box>
            <Footer />
          </>
        )}
      </Box>
    </FormContext.Provider>
  );
}

function Header({
  title,
  subtitle,
}: Readonly<{ title: string; subtitle?: string }>): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="cyan">◆ </Text>
        <Text bold>{title}</Text>
      </Box>
      {subtitle && (
        <Box paddingLeft={2}>
          <Text dimColor>{subtitle}</Text>
        </Box>
      )}
    </Box>
  );
}

function DoneRow({ error }: Readonly<{ error: string | null }>): React.ReactElement {
  if (error) {
    return (
      <Box paddingLeft={2}>
        <Text color="red">✗ </Text>
        <Text color="red">{error}</Text>
      </Box>
    );
  }
  return (
    <Box paddingLeft={2}>
      <Text color="green">✓ </Text>
      <Text>done</Text>
    </Box>
  );
}

function Footer(): React.ReactElement {
  return (
    <Box marginTop={1} paddingLeft={2}>
      <Text dimColor>Tab navigate · Enter advance · Esc cancel</Text>
    </Box>
  );
}

interface SubmitButtonProps {
  readonly label: string;
  readonly enabled: boolean;
  readonly submitting: boolean;
  readonly onPress: () => void;
}

/**
 * Plain focusable Submit button. Lives inside the focus cycle so
 * Tab from the last field lands here naturally. Enter or Space
 * activates; click activates on `up`.
 */
function SubmitButton({
  label,
  enabled,
  submitting,
  onPress,
}: Readonly<SubmitButtonProps>): React.ReactElement {
  const buttonId = 'formfield:__submit__';
  const { isFocused } = useFocus({ id: buttonId, isActive: enabled });
  const boxRef = useRef<DOMElement>(null);
  const bounds = useBounds(boxRef);
  const { focus } = useFocusManager();

  useInput(
    (input, key) => {
      if (!enabled) {
        return;
      }
      if (key.return || input === ' ') {
        onPress();
      }
    },
    { isActive: isFocused && enabled }
  );

  const handleMouse = useCallback(
    (e: { action: string; button: string; column: number; row: number }) => {
      if (!enabled || !bounds || e.button !== 'left') {
        return;
      }
      if (!hitTest(bounds, e)) {
        return;
      }
      if (e.action === 'down') {
        focus(buttonId);
      } else if (e.action === 'click') {
        onPress();
      }
    },
    [enabled, bounds, focus, onPress]
  );
  useMouse(handleMouse);

  if (submitting) {
    return (
      <Box>
        <Text dimColor>⠋ submitting…</Text>
      </Box>
    );
  }

  const color = enabled ? 'green' : undefined;
  return (
    <Box ref={boxRef}>
      <Text color={color} bold={isFocused} dimColor={!enabled}>
        {isFocused ? '▸ ' : '  '}[ {label} ]
      </Text>
    </Box>
  );
}
