import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  PasswordInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { useUserMutations } from '../hooks';

const ROLES = ['admin', 'user', 'guest'] as const;

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateUserDialog({ open, onOpenChange }: Readonly<CreateUserDialogProps>) {
  const { t } = useLocale();
  const { create } = useUserMutations();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('user');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const resetForm = () => {
    setEmail('');
    setName('');
    setRole('user');
    setPassword('');
    setError('');
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      resetForm();
    }
    onOpenChange(next);
  };

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    create.mutate(
      {
        email: email.trim(),
        name: name.trim(),
        role,
        password,
      },
      {
        onSuccess: () => {
          resetForm();
          onOpenChange(false);
        },
        onError: (err) => setError(err.message),
      }
    );
  };

  const isValid = email.trim() && name.trim() && password.trim();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('users:createUser')}</DialogTitle>
          <DialogDescription>{t('users:subtitle')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="create-email">{t('users:fields.email')}</Label>
            <Input
              id="create-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('users:placeholders.email')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-name">{t('users:fields.name')}</Label>
            <Input
              id="create-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('users:placeholders.name')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-role">{t('users:fields.role')}</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="create-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`users:roles.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-password">{t('users:fields.password')}</Label>
            <PasswordInput
              id="create-password"
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
            <Button type="submit" disabled={!isValid || create.isPending}>
              {create.isPending ? t('common:messages.saving') : t('users:createUser')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
