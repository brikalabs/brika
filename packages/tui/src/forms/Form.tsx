/**
 * Multi-step form, composed via children. Walks its `<FormField>`
 * children at render time to derive the step list, then drives the
 * active step from internal state. Inputs inside each field read
 * their handle via context — no prop drilling.
 *
 *   <Form
 *     title="Add user"
 *     subtitle="Esc cancels at any step"
 *     onSubmit={async (values) => { await api.create(values); }}
 *     onCancel={onClose}
 *   >
 *     <FormField name="email" label="Email" validate={emailish}>
 *       <FormInput placeholder="ada@example.com" />
 *     </FormField>
 *     <FormField name="role" label="Role">
 *       <FormSelect options={[{ value: 'user', label: 'User' }]} />
 *     </FormField>
 *   </Form>
 *
 * Chrome is clack-style:
 *   - title row with `◆`
 *   - completed steps as compact `✓ Label: value` rows
 *   - active step shown with a vertical `│` rail
 *   - validation error rendered red under the active input
 *   - "submitting…" → "✓ done" / "✗ <message>" once `onSubmit` resolves
 *
 * While mounted, the form calls `useCaptureInput()` so global
 * keybinds (s, x, r, …) don't fire on keystrokes meant for the
 * form. Ctrl+C remains live as an escape hatch.
 */

import { Box, Text } from 'ink';
import React, { useMemo, useState } from 'react';
import { useCaptureInput } from '../shell/useTuiShell';
import { FormField, type FormFieldProps } from './FormField';
import {
  FormContext,
  type FormContextValue,
  type FormValue,
  type FormValues,
} from './useFormContext';

export interface FormProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly onSubmit: (values: FormValues) => void | Promise<void>;
  readonly onCancel?: () => void;
  readonly children: React.ReactNode;
}

interface FieldDescriptor {
  readonly props: FormFieldProps;
}

function collectFields(children: React.ReactNode): FieldDescriptor[] {
  const out: FieldDescriptor[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) {
      return;
    }
    if (child.type !== FormField) {
      return;
    }
    out.push({ props: child.props as FormFieldProps });
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

export function Form({
  title,
  subtitle,
  onSubmit,
  onCancel,
  children,
}: Readonly<FormProps>): React.ReactElement {
  useCaptureInput();

  const fields = useMemo(() => collectFields(children), [children]);
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState<FormValues>(() => initialValues(fields));
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const done = index >= fields.length;
  const active = fields[index];

  const setValue = (name: string, next: FormValue): void => {
    setValues((prev) => ({ ...prev, [name]: next }));
    setErrors((prev) => ({ ...prev, [name]: null }));
  };

  const advance = async (nextValues: FormValues): Promise<void> => {
    if (index + 1 < fields.length) {
      setIndex(index + 1);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(nextValues);
      setIndex(fields.length);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const submitField = (name: string, override?: FormValue): void => {
    const field = fields.find((f) => f.props.name === name);
    if (!field) {
      return;
    }
    const effective = override ?? values[name] ?? '';
    // Snapshot the values record with the effective field so async
    // submission and validators see the latest set even if React
    // hasn't flushed our setValue yet.
    const nextValues = override === undefined ? values : { ...values, [name]: override };
    if (override !== undefined) {
      setValues(nextValues);
    }
    const validation = field.props.validate?.(effective, nextValues) ?? null;
    if (validation !== null) {
      setErrors((prev) => ({ ...prev, [name]: validation }));
      return;
    }
    void advance(nextValues);
  };

  const cancel = (): void => onCancel?.();

  const ctxValue: FormContextValue = {
    values,
    currentName: active?.props.name ?? null,
    errors,
    setValue,
    submitField,
    cancel,
  };

  return (
    <FormContext.Provider value={ctxValue}>
      <Box flexDirection="column">
        <Header title={title} subtitle={subtitle} />
        <CompletedRows fields={fields.slice(0, index)} values={values} />
        <Body done={done} submitting={submitting} submitError={submitError} active={active} />
        {!done && !submitting && <Footer />}
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

interface CompletedRowsProps {
  readonly fields: ReadonlyArray<FieldDescriptor>;
  readonly values: FormValues;
}

function CompletedRows({ fields, values }: Readonly<CompletedRowsProps>): React.ReactElement {
  if (fields.length === 0) {
    return <Box />;
  }
  return (
    <Box flexDirection="column" marginBottom={1}>
      {fields.map((field) => {
        const display = formatValue(field, values[field.props.name]);
        return (
          <Box key={field.props.name}>
            <Text color="green">✓ </Text>
            <Text dimColor>{field.props.label}: </Text>
            <Text>{display}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

function formatValue(field: FieldDescriptor, value: FormValue | undefined): string {
  if (value === undefined) {
    return '';
  }
  if (field.props.summarize) {
    return field.props.summarize(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no';
  }
  return value;
}

interface BodyProps {
  readonly done: boolean;
  readonly submitting: boolean;
  readonly submitError: string | null;
  readonly active: FieldDescriptor | undefined;
}

function Body({ done, submitting, submitError, active }: Readonly<BodyProps>): React.ReactElement {
  if (done) {
    if (submitError) {
      return (
        <Box paddingLeft={2}>
          <Text color="red">✗ </Text>
          <Text color="red">{submitError}</Text>
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
  if (submitting) {
    return (
      <Box paddingLeft={2}>
        <Text color="cyan">◇ </Text>
        <Text dimColor>{active?.props.label ?? ''}: submitting…</Text>
      </Box>
    );
  }
  if (!active) {
    return <Box />;
  }
  // Render the FormField element for the active step. The FormField
  // pulls its handle from context and renders its inner input.
  return React.createElement(FormField, active.props);
}

function Footer(): React.ReactElement {
  return (
    <Box marginTop={1} paddingLeft={2}>
      <Text dimColor>Enter to continue · Esc to cancel</Text>
    </Box>
  );
}
