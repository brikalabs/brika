import { Button, Card, CardContent, CardHeader, CardTitle } from '@brika/clay';
import { BrikaLogo } from '@brika/clay/components/brika-logo';
import { Link } from '@tanstack/react-router';
import { ArrowRight, BookOpen, LayoutGrid, type LucideIcon, Plug, Workflow } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import { paths } from '@/routes/paths';

interface StepRowProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

function StepRow({ icon: Icon, title, description }: Readonly<StepRowProps>) {
  return (
    <div className="flex gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm">{title}</p>
        <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

export function GettingStartedCard() {
  const { t } = useLocale();

  return (
    <Card className="flex-1">
      <CardHeader className="pb-3">
        <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-primary shadow-primary/25 shadow-sm">
          <BrikaLogo className="size-6 text-white" />
        </div>
        <CardTitle className="text-base">{t('onboarding:gettingStarted.title')}</CardTitle>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {t('onboarding:gettingStarted.subtitle')}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <StepRow
          icon={Plug}
          title={t('onboarding:gettingStarted.steps.installPlugin.title')}
          description={t('onboarding:gettingStarted.steps.installPlugin.description')}
        />
        <StepRow
          icon={LayoutGrid}
          title={t('onboarding:gettingStarted.steps.composeBoard.title')}
          description={t('onboarding:gettingStarted.steps.composeBoard.description')}
        />
        <StepRow
          icon={Workflow}
          title={t('onboarding:gettingStarted.steps.buildWorkflow.title')}
          description={t('onboarding:gettingStarted.steps.buildWorkflow.description')}
        />

        <Button asChild size="sm" className="mt-1 w-full gap-2">
          <Link to={paths.plugins.list.path}>
            <Plug className="size-4" />
            {t('onboarding:gettingStarted.steps.installPlugin.action')}
            <ArrowRight className="ml-auto size-4" />
          </Link>
        </Button>

        <Link
          to={paths.help.concepts.path}
          className="inline-flex items-center gap-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground"
        >
          <BookOpen className="size-3.5" />
          {t('onboarding:gettingStarted.learnMore')}
        </Link>
      </CardContent>
    </Card>
  );
}
