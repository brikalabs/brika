/**
 * Preview scenes — two curated compositions rendered inside PreviewCanvas.
 *
 * `Library`  — a dense component gallery + typography row; the
 *              reference sheet for every token the builder exposes.
 * `App`      — one curated product-shaped layout (sidebar · card · form
 *              · empty state) so users can evaluate the theme on
 *              realistic chrome without wading through four separate
 *              scenes.
 *
 * Every textual label flows through i18n. `SectionHeader` pins
 * each section's heading so readers never lose their place when
 * scrolling a tall preview pane.
 */

import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Home,
  Info,
  Mail,
  Search,
  Settings,
  Sparkles,
  Zap,
} from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
  Input,
  Label,
  Progress,
  SectionLabel,
  Separator,
  Switch,
  Textarea,
} from '@/components/ui';

/* ─────────────────────────────────────────────────────────────
   Primitives
   ───────────────────────────────────────────────────────────── */

interface SectionProps {
  label: ReactNode;
  children: ReactNode;
}

function Section({ label, children }: Readonly<SectionProps>) {
  return (
    <section className="space-y-3">
      <div className="sticky top-0 z-10 border-b bg-background/85 py-1 backdrop-blur-sm">
        <SectionLabel>{label}</SectionLabel>
      </div>
      {children}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   Scene: Library — a clean reference gallery
   ───────────────────────────────────────────────────────────── */

function LibrarySceneImpl() {
  const { t } = useTranslation('themeBuilder');
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Typography — folded in from the old Marketing scene */}
      <Section label={t('preview.library.typography')}>
        <div className="space-y-2">
          <h1 className="font-semibold text-4xl tracking-tight">{t('preview.library.display')}</h1>
          <p className="max-w-xl text-muted-foreground text-sm leading-relaxed">
            {t('preview.library.body')}
          </p>
          <code className="inline-block rounded-md bg-muted px-2 py-1 font-mono text-xs">
            const brika = () =&gt; &#123; theme: &apos;custom&apos; &#125;;
          </code>
        </div>
      </Section>

      <Section label={t('preview.library.buttons')}>
        <div className="flex flex-wrap gap-2">
          <Button>{t('preview.library.primary')}</Button>
          <Button variant="secondary">{t('preview.library.secondary')}</Button>
          <Button variant="outline">{t('preview.library.outline')}</Button>
          <Button variant="ghost">{t('preview.library.ghost')}</Button>
          <Button variant="destructive">{t('preview.library.destructive')}</Button>
          <Button size="sm">
            <Sparkles /> {t('preview.library.withIcon')}
          </Button>
        </div>
      </Section>

      <Section label={t('preview.library.badges')}>
        <div className="flex flex-wrap gap-2">
          <Badge>{t('preview.library.badgeDefault')}</Badge>
          <Badge variant="secondary">{t('preview.library.secondary')}</Badge>
          <Badge variant="outline">{t('preview.library.outline')}</Badge>
          <Badge variant="destructive">{t('preview.library.destructive')}</Badge>
          <Badge className="gap-1 border-success/30 bg-success/10 text-success">
            <CheckCircle2 className="size-3" /> {t('preview.library.success')}
          </Badge>
          <Badge className="gap-1 border-warning/30 bg-warning/10 text-warning">
            <AlertTriangle className="size-3" /> {t('preview.library.warning')}
          </Badge>
          <Badge className="gap-1 border-info/30 bg-info/10 text-info">
            <Info className="size-3" /> {t('preview.library.info')}
          </Badge>
        </div>
      </Section>

      <Section label={t('preview.library.formControls')}>
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder={t('preview.library.searchPlaceholder')} />
          <Input placeholder={t('preview.library.disabled')} disabled />
        </div>
        <div className="flex items-center gap-4 rounded-md border p-3">
          <Switch defaultChecked />
          <Label className="text-sm">{t('preview.library.enableFeature')}</Label>
        </div>
      </Section>

      <Section label={t('preview.library.dataPalette')}>
        <div className="grid grid-cols-8 gap-2">
          {(
            [
              'data-1',
              'data-2',
              'data-3',
              'data-4',
              'data-5',
              'data-6',
              'data-7',
              'data-8',
            ] as const
          ).map((token) => (
            <div key={token} className="space-y-1">
              <div
                className="h-10 w-full rounded-md border"
                style={{ backgroundColor: `var(--${token})` }}
              />
              <div className="text-center font-mono text-[10px] text-muted-foreground">
                {token.replace('data-', '')}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section label={t('preview.library.emptyState')}>
        <EmptyState>
          <EmptyStateIcon>
            <Zap />
          </EmptyStateIcon>
          <EmptyStateTitle>{t('preview.library.emptyTitle')}</EmptyStateTitle>
          <EmptyStateDescription>{t('preview.library.emptyDescription')}</EmptyStateDescription>
        </EmptyState>
      </Section>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Scene: App — one realistic product layout
   ───────────────────────────────────────────────────────────── */

interface NavItemProps {
  icon: typeof Home;
  label: string;
  active?: boolean;
}

function NavItem({ icon: Icon, label, active }: Readonly<NavItemProps>) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
        active
          ? 'bg-accent font-medium text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/40'
      }`}
    >
      <Icon className="size-4" />
      <span className="truncate">{label}</span>
    </div>
  );
}

function AppSceneImpl() {
  const { t } = useTranslation('themeBuilder');

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-[12rem_1fr] gap-4">
      {/* Sidebar */}
      <aside className="space-y-4 rounded-lg border bg-card p-3">
        <div className="flex items-center gap-2">
          <div className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="size-3.5" />
          </div>
          <span className="font-semibold text-sm">{t('preview.app.brand')}</span>
        </div>

        <div className="space-y-0.5">
          <NavItem icon={Home} label={t('preview.app.nav.home')} active />
          <NavItem icon={Bell} label={t('preview.app.nav.activity')} />
          <NavItem icon={Mail} label={t('preview.app.nav.inbox')} />
          <NavItem icon={Settings} label={t('preview.app.nav.settings')} />
        </div>
      </aside>

      {/* Main column */}
      <div className="min-w-0 space-y-4">
        {/* Header / search */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={t('preview.app.searchPlaceholder')} className="pl-8" />
          </div>
          <Button size="sm" variant="outline">
            <Bell /> {t('preview.app.notifications')}
          </Button>
          <Avatar className="size-8">
            <AvatarFallback className="bg-accent text-accent-foreground text-xs">MS</AvatarFallback>
          </Avatar>
        </div>

        {/* Headline */}
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">{t('preview.app.headline')}</h1>
          <p className="text-muted-foreground text-sm">{t('preview.app.subheadline')}</p>
        </div>

        {/* Status + action card */}
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>{t('preview.app.cardTitle')}</CardTitle>
              <CardDescription>{t('preview.app.cardDescription')}</CardDescription>
            </div>
            <Badge variant="outline" className="gap-1 border-success/30 text-success">
              <CheckCircle2 className="size-3" /> {t('preview.library.success')}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={72} />
            <div className="flex items-center justify-between text-muted-foreground text-xs">
              <span>{t('preview.app.progressLabel', { percent: 72 })}</span>
              <span className="tabular-nums">3 / 5</span>
            </div>
          </CardContent>
        </Card>

        {/* Form snippet */}
        <Card>
          <CardHeader>
            <CardTitle>{t('preview.app.formTitle')}</CardTitle>
            <CardDescription>{t('preview.app.formDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="preview-name">{t('preview.app.workspaceName')}</Label>
              <Input id="preview-name" defaultValue="Acme Labs" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="preview-note">{t('preview.app.note')}</Label>
              <Textarea id="preview-note" rows={2} placeholder={t('preview.app.notePlaceholder')} />
            </div>
            <Separator />
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm">
                {t('preview.app.cancel')}
              </Button>
              <Button size="sm">{t('preview.app.save')}</Button>
            </div>
          </CardContent>
        </Card>

        {/* Empty-state tile */}
        <Card>
          <CardContent className="py-6">
            <EmptyState>
              <EmptyStateIcon>
                <Zap />
              </EmptyStateIcon>
              <EmptyStateTitle>{t('preview.app.emptyTitle')}</EmptyStateTitle>
              <EmptyStateDescription>{t('preview.app.emptyDescription')}</EmptyStateDescription>
              <Button size="sm" className="mt-3">
                <Sparkles /> {t('preview.app.emptyCta')}
              </Button>
            </EmptyState>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export const LibraryScene = memo(LibrarySceneImpl);
export const AppScene = memo(AppSceneImpl);
