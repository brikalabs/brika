import { type SubmitEventHandler, useEffect, useState } from 'react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import type { UserRecord } from '../api';
import { useUserMutations } from '../hooks';

const ROLES = [
  'admin',
  'user',
  'guest',
] as const;

const SCOPE_CATEGORIES = [
  'workflow',
  'board',
  'plugin',
  'settings',
] as const;

const ROLE_SCOPES_MAP: Record<string, string[]> = {
  admin: [
    'admin:*',
  ],
  user: [
    'workflow:read',
    'workflow:write',
    'workflow:execute',
    'board:read',
    'board:write',
    'plugin:read',
    'settings:read',
  ],
  guest: [
    'workflow:read',
    'board:read',
    'plugin:read',
  ],
  service: [],
};

function scopeCategory(scope: string): string {
  return scope.split(':')[0];
}

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserRecord;
}

export function EditUserDialog({ open, onOpenChange, user }: Readonly<EditUserDialogProps>) {
  const { t } = useLocale();
  const { update } = useUserMutations();

  const [name, setName] = useState(user.name);
  const [role, setRole] = useState(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [scopes, setScopes] = useState<string[]>(user.scopes ?? []);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      return;
    }
    setName(user.name);
    setRole(user.role);
    setIsActive(user.isActive);
    setScopes(user.scopes ?? []);
    setError('');
  }, [
    open,
    user.id,
    user.name,
    user.role,
    user.isActive,
    user.scopes,
  ]);

  // Reset scopes to role defaults when role changes
  useEffect(() => {
    setScopes(ROLE_SCOPES_MAP[role] ?? []);
  }, [
    role,
  ]);

  const roleScopes = ROLE_SCOPES_MAP[role] ?? [];
  const isAdmin = role === 'admin';

  function handleScopeToggle(scope: string, enabled: boolean) {
    setScopes((prev) =>
      enabled
        ? [
            ...prev,
            scope,
          ]
        : prev.filter((s) => s !== scope)
    );
  }

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    setError('');

    update.mutate(
      {
        id: user.id,
        name: name.trim(),
        role,
        isActive,
        scopes,
      },
      {
        onSuccess: () => onOpenChange(false),
        onError: (err) => setError(err.message),
      }
    );
  };

  const sortedScopes = [
    ...scopes,
  ].sort((a, b) => a.localeCompare(b));
  const sortedOriginal = [
    ...(user.scopes ?? []),
  ].sort((a, b) => a.localeCompare(b));
  const isDirty =
    name.trim() !== user.name ||
    role !== user.role ||
    isActive !== user.isActive ||
    JSON.stringify(sortedScopes) !== JSON.stringify(sortedOriginal);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('users:editUser')}</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>

        <form
          id="edit-user-form"
          onSubmit={handleSubmit}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1"
        >
          <div className="space-y-2">
            <Label htmlFor="edit-name">{t('users:fields.name')}</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('users:placeholders.name')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-role">{t('users:fields.role')}</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="edit-role">
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

          <div className="flex items-center justify-between">
            <Label htmlFor="edit-active">{t('users:fields.active')}</Label>
            <Switch id="edit-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {isAdmin ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
              <p className="text-amber-800 text-sm dark:text-amber-200">
                {t('users:scopes.adminWarning')}
              </p>
            </div>
          ) : (
            roleScopes.length > 0 && (
              <div className="space-y-3">
                <div>
                  <Label>{t('users:scopes.title')}</Label>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {t('users:scopes.description')}
                  </p>
                </div>
                {SCOPE_CATEGORIES.map((category) => {
                  const categoryScopes = roleScopes.filter((s) => scopeCategory(s) === category);
                  if (categoryScopes.length === 0) {
                    return null;
                  }

                  return (
                    <div key={category} className="space-y-1">
                      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                        {t(`users:scopes.categories.${category}`)}
                      </p>
                      {categoryScopes.map((scope) => {
                        const isEnabled = scopes.includes(scope);
                        return (
                          <div
                            key={scope}
                            className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2"
                          >
                            <p className="text-sm">{t(`users:scopes.${scope}`)}</p>
                            <Switch
                              checked={isEnabled}
                              onCheckedChange={(checked) => handleScopeToggle(scope, !!checked)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )
          )}

          {error && <p className="text-destructive text-sm">{error}</p>}
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            type="submit"
            form="edit-user-form"
            disabled={!isDirty || !name.trim() || update.isPending}
          >
            {update.isPending ? t('common:messages.saving') : t('common:actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
