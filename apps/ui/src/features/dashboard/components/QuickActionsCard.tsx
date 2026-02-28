import { LayoutDashboard, Play, Plug, Workflow, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { routes } from '@/routes';
import { QuickAction } from './QuickAction';

export function QuickActionsCard() {
  const { t } = useLocale();

  return (
    <Card className="flex-1">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Play className="size-4 text-primary" />
          {t('common:actions.create')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <QuickAction
          icon={Workflow}
          label={t('workflows:actions.create')}
          href={routes.workflows.list.path}
          accent="orange"
        />
        <QuickAction icon={Plug} label={t('nav:plugins')} href={routes.plugins.list.path} accent="blue" />
        <QuickAction icon={Zap} label={t('sparks:title')} href={routes.sparks.list.path} accent="emerald" />
        <QuickAction
          icon={LayoutDashboard}
          label={t('boards:title')}
          href={routes.boards.list.path}
          accent="purple"
        />
      </CardContent>
    </Card>
  );
}
