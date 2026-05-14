/**
 * Clack-style multi-step form. Steps are declarative; the Wizard
 * walks them one at a time, accumulating values, with previously
 * completed steps rendered as compact "✓ Label: value" rows above
 * the active prompt. Esc cancels at any point.
 *
 * While mounted, the Wizard captures input via `useCaptureInput()`
 * so global keybinds (s / x / r / etc.) don't fire — your `s` in a
 * password field stays a `s`.
 *
 *   <Wizard
 *     title="Add user"
 *     steps={[
 *       { name: 'name',  kind: 'text',     label: 'Full name', validate: required },
 *       { name: 'email', kind: 'text',     label: 'Email',     validate: emailish },
 *       { name: 'role',  kind: 'select',   label: 'Role',      options: [...] },
 *       { name: 'pwd',   kind: 'password', label: 'Password',  validate: minLen(8) },
 *     ]}
 *     onSubmit={async (values) => …}
 *     onCancel={() => …}
 *   />
 *
 * `onSubmit` may be async; the wizard renders a "submitting…" line
 * while it's in flight and surfaces any thrown error as a red message.
 */

import { useCaptureInput } from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import { useState } from 'react';
import { ConfirmInput } from './ConfirmInput';
import { SelectInput, type SelectOption } from './SelectInput';
import { TextInput } from './TextInput';

type Validator = (value: string) => string | null;

export type WizardStep =
  | {
      readonly name: string;
      readonly kind: 'text';
      readonly label: string;
      readonly placeholder?: string;
      readonly initial?: string;
      readonly validate?: Validator;
    }
  | {
      readonly name: string;
      readonly kind: 'password';
      readonly label: string;
      readonly initial?: string;
      readonly validate?: Validator;
    }
  | {
      readonly name: string;
      readonly kind: 'select';
      readonly label: string;
      readonly options: ReadonlyArray<SelectOption>;
      readonly initial?: string;
    }
  | {
      readonly name: string;
      readonly kind: 'confirm';
      readonly label: string;
      readonly initial?: boolean;
    };

export type WizardValues = Record<string, string | boolean>;

export interface WizardProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly steps: ReadonlyArray<WizardStep>;
  readonly onSubmit: (values: WizardValues) => void | Promise<void>;
  readonly onCancel?: () => void;
}

export function Wizard({
  title,
  subtitle,
  steps,
  onSubmit,
  onCancel,
}: Readonly<WizardProps>): React.ReactElement {
  useCaptureInput();

  const [index, setIndex] = useState(0);
  const [values, setValues] = useState<WizardValues>(() => initialValues(steps));
  const [draft, setDraft] = useState<string>(() => firstDraft(steps));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const step = steps[index];
  const done = index >= steps.length;

  const advance = async (nextValues: WizardValues): Promise<void> => {
    if (index + 1 >= steps.length) {
      setSubmitting(true);
      setSubmitError(null);
      try {
        await onSubmit(nextValues);
        setIndex(steps.length);
      } catch (e) {
        setSubmitError(e instanceof Error ? e.message : String(e));
      } finally {
        setSubmitting(false);
      }
      return;
    }
    setIndex(index + 1);
    setDraft(initialDraft(steps[index + 1]));
    setError(null);
  };

  const submitText = (value: string): void => {
    if (!step || (step.kind !== 'text' && step.kind !== 'password')) {
      return;
    }
    const validation = step.validate?.(value) ?? null;
    if (validation) {
      setError(validation);
      return;
    }
    const next = { ...values, [step.name]: value };
    setValues(next);
    void advance(next);
  };

  const submitSelect = (value: string): void => {
    if (!step || step.kind !== 'select') {
      return;
    }
    const next = { ...values, [step.name]: value };
    setValues(next);
    void advance(next);
  };

  const submitConfirm = (value: boolean): void => {
    if (!step || step.kind !== 'confirm') {
      return;
    }
    const next = { ...values, [step.name]: value };
    setValues(next);
    void advance(next);
  };

  return (
    <Box flexDirection="column">
      <Header title={title} subtitle={subtitle} />
      <History steps={steps} values={values} upToIndex={index} />
      <Body
        done={done}
        submitting={submitting}
        submitError={submitError}
        step={step}
        draft={draft}
        setDraft={setDraft}
        error={error}
        onSubmitText={submitText}
        onSubmitSelect={submitSelect}
        onSubmitConfirm={submitConfirm}
        onCancel={onCancel}
      />

      {!done && !submitting && (
        <Box marginTop={1} paddingLeft={2}>
          <Text dimColor>Enter to continue · Esc to cancel</Text>
        </Box>
      )}
    </Box>
  );
}

interface BodyProps {
  readonly done: boolean;
  readonly submitting: boolean;
  readonly submitError: string | null;
  readonly step: WizardStep | undefined;
  readonly draft: string;
  readonly setDraft: (v: string) => void;
  readonly error: string | null;
  readonly onSubmitText: (v: string) => void;
  readonly onSubmitSelect: (v: string) => void;
  readonly onSubmitConfirm: (v: boolean) => void;
  readonly onCancel?: () => void;
}

function Body(props: Readonly<BodyProps>): React.ReactElement {
  if (props.done) {
    return <DoneRow error={props.submitError} />;
  }
  if (props.submitting) {
    return <SubmittingRow label={props.step?.label ?? ''} />;
  }
  if (!props.step) {
    return <Box />;
  }
  return (
    <ActiveStep
      step={props.step}
      draft={props.draft}
      setDraft={props.setDraft}
      error={props.error}
      onSubmitText={props.onSubmitText}
      onSubmitSelect={props.onSubmitSelect}
      onSubmitConfirm={props.onSubmitConfirm}
      onCancel={props.onCancel}
    />
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

interface HistoryProps {
  readonly steps: ReadonlyArray<WizardStep>;
  readonly values: WizardValues;
  readonly upToIndex: number;
}

function History({ steps, values, upToIndex }: Readonly<HistoryProps>): React.ReactElement {
  if (upToIndex === 0) {
    return <Box />;
  }
  return (
    <Box flexDirection="column" marginBottom={1}>
      {steps.slice(0, upToIndex).map((s) => {
        const v = values[s.name];
        const display = formatValue(s, v);
        return (
          <Box key={s.name}>
            <Text color="green">✓ </Text>
            <Text dimColor>{s.label}: </Text>
            <Text>{display}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

function formatValue(step: WizardStep, value: string | boolean | undefined): string {
  if (value === undefined) {
    return '';
  }
  if (step.kind === 'password') {
    return typeof value === 'string' ? '•'.repeat(value.length) : '';
  }
  if (step.kind === 'confirm') {
    return value === true ? 'yes' : 'no';
  }
  if (step.kind === 'select') {
    return String(value);
  }
  return String(value);
}

interface ActiveStepProps {
  readonly step: WizardStep;
  readonly draft: string;
  readonly setDraft: (v: string) => void;
  readonly error: string | null;
  readonly onSubmitText: (v: string) => void;
  readonly onSubmitSelect: (v: string) => void;
  readonly onSubmitConfirm: (v: boolean) => void;
  readonly onCancel?: () => void;
}

function ActiveStep({
  step,
  draft,
  setDraft,
  error,
  onSubmitText,
  onSubmitSelect,
  onSubmitConfirm,
  onCancel,
}: Readonly<ActiveStepProps>): React.ReactElement {
  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Box>
        <Text color="cyan">│ </Text>
        <Text bold>{step.label}</Text>
      </Box>
      <Box>
        <Text color="cyan">│ </Text>
        <StepInput
          step={step}
          draft={draft}
          setDraft={setDraft}
          onSubmitText={onSubmitText}
          onSubmitSelect={onSubmitSelect}
          onSubmitConfirm={onSubmitConfirm}
          onCancel={onCancel}
        />
      </Box>
      {error && (
        <Box>
          <Text color="red">│ </Text>
          <Text color="red">{error}</Text>
        </Box>
      )}
    </Box>
  );
}

function StepInput({
  step,
  draft,
  setDraft,
  onSubmitText,
  onSubmitSelect,
  onSubmitConfirm,
  onCancel,
}: Readonly<Omit<ActiveStepProps, 'error'>>): React.ReactElement {
  if (step.kind === 'text') {
    return (
      <TextInput
        value={draft}
        onChange={setDraft}
        onSubmit={onSubmitText}
        onCancel={onCancel}
        placeholder={step.placeholder}
      />
    );
  }
  if (step.kind === 'password') {
    return (
      <TextInput
        value={draft}
        onChange={setDraft}
        onSubmit={onSubmitText}
        onCancel={onCancel}
        mask
      />
    );
  }
  if (step.kind === 'select') {
    return (
      <SelectInput
        options={step.options}
        value={step.initial}
        onSubmit={onSubmitSelect}
        onCancel={onCancel}
      />
    );
  }
  return (
    <ConfirmInput value={step.initial ?? true} onSubmit={onSubmitConfirm} onCancel={onCancel} />
  );
}

function SubmittingRow({ label }: Readonly<{ label: string }>): React.ReactElement {
  return (
    <Box paddingLeft={2}>
      <Text color="cyan">◇ </Text>
      <Text dimColor>{label}: submitting…</Text>
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

function initialValues(steps: ReadonlyArray<WizardStep>): WizardValues {
  const out: WizardValues = {};
  for (const step of steps) {
    if (step.kind === 'confirm') {
      out[step.name] = step.initial ?? true;
    } else if (step.kind === 'select') {
      out[step.name] = step.initial ?? step.options[0]?.value ?? '';
    } else {
      out[step.name] = step.initial ?? '';
    }
  }
  return out;
}

function firstDraft(steps: ReadonlyArray<WizardStep>): string {
  return initialDraft(steps[0]);
}

function initialDraft(step: WizardStep | undefined): string {
  if (!step) {
    return '';
  }
  if (step.kind === 'text' || step.kind === 'password') {
    return step.initial ?? '';
  }
  return '';
}
