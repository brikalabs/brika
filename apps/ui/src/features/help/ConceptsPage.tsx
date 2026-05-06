import { Card, CardContent, CardHeader, CardTitle } from '@brika/clay';
import { Link } from '@tanstack/react-router';
import {
  ArrowRight,
  Blocks,
  LayoutGrid,
  type LucideIcon,
  Plug,
  Puzzle,
  Workflow,
  Zap,
} from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import { paths } from '@/routes/paths';

interface Concept {
  id: string;
  icon: LucideIcon;
  link?: { to: string; labelKey: string };
}

const CONCEPTS: readonly Concept[] = [
  {
    id: 'plugin',
    icon: Plug,
    link: { to: paths.plugins.list.path, labelKey: 'concepts:learnMore.plugins' },
  },
  {
    id: 'block',
    icon: Blocks,
    link: { to: paths.blocks.blocks.path, labelKey: 'concepts:learnMore.blocks' },
  },
  {
    id: 'brick',
    icon: Puzzle,
    link: { to: paths.boards.list.path, labelKey: 'concepts:learnMore.boards' },
  },
  {
    id: 'spark',
    icon: Zap,
    link: { to: paths.sparks.list.path, labelKey: 'concepts:learnMore.sparks' },
  },
  {
    id: 'workflow',
    icon: Workflow,
    link: { to: paths.workflows.list.path, labelKey: 'concepts:learnMore.workflows' },
  },
  {
    id: 'board',
    icon: LayoutGrid,
    link: { to: paths.boards.list.path, labelKey: 'concepts:learnMore.boards' },
  },
] as const;

interface ConceptCardProps {
  concept: Concept;
}

function ConceptCard({ concept }: Readonly<ConceptCardProps>) {
  const { t } = useLocale();
  const Icon = concept.icon;

  return (
    <Card id={concept.id}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-5" />
          </div>
          <CardTitle className="text-lg">{t(`concepts:items.${concept.id}.title`)}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-relaxed">{t(`concepts:items.${concept.id}.definition`)}</p>
        <p className="rounded-md bg-muted/50 p-3 text-muted-foreground text-sm leading-relaxed">
          <span className="font-medium text-foreground">{t('concepts:exampleLabel')}: </span>
          {t(`concepts:items.${concept.id}.example`)}
        </p>
        {concept.link && (
          <Link
            to={concept.link.to}
            className="inline-flex items-center gap-1.5 text-primary text-sm transition-opacity hover:opacity-80"
          >
            {t(concept.link.labelKey)}
            <ArrowRight className="size-3.5" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

export function ConceptsPage() {
  const { t } = useLocale();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">{t('concepts:title')}</h1>
        <p className="mt-1 text-muted-foreground">{t('concepts:subtitle')}</p>
      </div>

      <div className="grid gap-4">
        {CONCEPTS.map((concept) => (
          <ConceptCard key={concept.id} concept={concept} />
        ))}
      </div>
    </div>
  );
}
