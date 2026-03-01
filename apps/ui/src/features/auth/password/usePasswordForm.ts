import { useAuth } from '@brika/auth/react';
import { type SubmitEvent, useRef, useState } from 'react';
import { useLocale } from '@/lib/use-locale';

export interface PasswordFormState {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  saving: boolean;
  saved: boolean;
  error: string | null;
  /** Which field the error relates to */
  errorField: 'current' | 'new' | null;
}

export function usePasswordForm() {
  const { client } = useAuth();
  const { t } = useLocale();

  const currentRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLInputElement>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<'current' | 'new' | null>(null);

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    !mismatch &&
    !saving;

  const clearError = () => {
    setError(null);
    setErrorField(null);
    setSaved(false);
  };

  const handlePasswordError = (err: unknown) => {
    const message = err instanceof Error ? err.message : 'Failed';
    const isCurrentPasswordError =
      message.toLowerCase().includes('current password') ||
      message.toLowerCase().includes('invalid');

    setErrorField(isCurrentPasswordError ? 'current' : 'new');
    setError(isCurrentPasswordError ? t('auth:password.wrongCurrent') : message);

    // Auto-focus the relevant field
    if (isCurrentPasswordError) {
      setCurrentPassword('');
      requestAnimationFrame(() => currentRef.current?.focus());
    } else {
      requestAnimationFrame(() => newRef.current?.focus());
    }
  };

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      return;
    }

    clearError();
    setSaving(true);
    try {
      await client.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      handlePasswordError(err);
    } finally {
      setSaving(false);
    }
  };

  return {
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    saving,
    saved,
    error,
    errorField,
    mismatch,
    canSubmit,
    clearError,
    handleSubmit,
    currentRef,
    newRef,
  };
}
