import { Button, Card } from '@brika/clay';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Search, Workflow } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import { paths } from '@/routes/paths';

interface WorkflowsEmptyProps {
  hasSearch: boolean;
}

export function WorkflowsEmpty({ hasSearch }: Readonly<WorkflowsEmptyProps>) {
  const { t } = useLocale();
  const navigate = useNavigate();

  const Icon = hasSearch ? Search : Workflow;

  return (
    <Card className="border-dashed p-16 text-center">
      <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-muted/50">
        <Icon className="size-8 text-muted-foreground opacity-50" />
      </div>
      <h3 className="font-semibold text-base">
        {hasSearch ? t('workflows:noResults') : t('workflows:empty')}
      </h3>
      {!hasSearch && (
        <>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground text-sm leading-relaxed">
            {t('workflows:emptyDescription')}
          </p>
          <div className="mt-4">
            <Button onClick={() => navigate({ to: paths.workflows.new.path })}>
              <Plus className="mr-2 size-4" />
              {t('workflows:actions.create')}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
