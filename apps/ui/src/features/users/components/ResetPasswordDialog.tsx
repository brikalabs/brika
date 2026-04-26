import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  PasswordInput,
} from '@brika/clay';
import { useState } from 'react';
import { useLocale } from '@/lib/use-locale';
import { useUserMutations } from '../hooks';

interface ResetPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
}

export function ResetPasswordDialog({
  open,
  onOpenChange,
  userId,
  userName,
}: Readonly<ResetPasswordDialogProps>) {
  const { t } = useLocale();
  const { resetPassword } = useUserMutations();

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setPassword('');
      setError('');
    }
    onOpenChange(next);
  };

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    resetPassword.mutate(
      {
        id: userId,
        password,
      },
      {
        onSuccess: () => {
          setPassword('');
          onOpenChange(false);
        },
        onError: (err) => setError(err.message),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('users:resetPassword')}</DialogTitle>
          <DialogDescription>
            {t('users:resetPasswordDesc', {
              name: userName,
            })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-password">{t('users:fields.password')}</Label>
            <PasswordInput
              id="reset-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('users:placeholders.password')}
              required
            />
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" disabled={!password.trim() || resetPassword.isPending}>
              {resetPassword.isPending ? t('common:messages.saving') : t('users:resetPassword')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
