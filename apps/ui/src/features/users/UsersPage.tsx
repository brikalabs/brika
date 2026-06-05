import { Button } from '@brika/clay';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useCapture } from '@/features/analytics/hooks';
import { useLocale } from '@/lib/use-locale';
import { CreateUserDialog, UsersTable } from './components';
import { useUsers } from './hooks';

export function UsersPage() {
  const { t } = useLocale();
  const capture = useCapture();
  const { data, isLoading } = useUsers();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">{t('users:title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('users:subtitle')}</p>
        </div>
        <Button
          onClick={() => {
            capture('users.create_dialog_opened');
            setCreateOpen(true);
          }}
        >
          <Plus className="size-4" />
          {t('users:createUser')}
        </Button>
      </div>

      <UsersTable users={data?.users ?? []} isLoading={isLoading} />

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
