import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { useUsers } from './hooks';
import { CreateUserDialog, UsersTable } from './components';

export function UsersPage() {
  const { t } = useLocale();
  const { data, isLoading } = useUsers();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">{t('users:title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('users:subtitle')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          {t('users:createUser')}
        </Button>
      </div>

      <UsersTable users={data?.users ?? []} isLoading={isLoading} />

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
