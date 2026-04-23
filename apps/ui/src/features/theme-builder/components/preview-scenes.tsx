/**
 * Preview scenes — sample compositions rendered inside PreviewCanvas.
 * Each scene is a self-contained block; the canvas owns the theming
 * wrapper and mode toggle, so scenes only describe *what* to render.
 */

import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Clock,
  Info,
  Mail,
  Search,
  Sparkles,
  TrendingUp,
  User,
  XCircle,
  Zap,
} from 'lucide-react';
import { memo } from 'react';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/ui';

/* ─────────────────────────────────────────────────────────────
   Scene: Components — broad palette of primitives
   ───────────────────────────────────────────────────────────── */
function ComponentsSceneImpl() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="space-y-2">
        <h1 className="font-semibold text-2xl tracking-tight">Typography</h1>
        <p className="text-muted-foreground text-sm">
          The quick brown fox jumps over the lazy dog. 0123456789.
        </p>
        <code className="inline-block rounded-md bg-muted px-2 py-1 font-mono text-xs">
          const brika = () =&gt; &#123; theme: &apos;custom&apos; &#125;;
        </code>
      </section>

      <section className="space-y-3">
        <SectionLabel>Buttons</SectionLabel>
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button size="sm">
            <Sparkles /> With icon
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <SectionLabel>Badges</SectionLabel>
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge className="gap-1 border-success/30 bg-success/10 text-success">
            <CheckCircle2 className="size-3" /> Success
          </Badge>
          <Badge className="gap-1 border-warning/30 bg-warning/10 text-warning">
            <AlertTriangle className="size-3" /> Warning
          </Badge>
          <Badge className="gap-1 border-info/30 bg-info/10 text-info">
            <Info className="size-3" /> Info
          </Badge>
        </div>
      </section>

      <section className="space-y-3">
        <SectionLabel>Card</SectionLabel>
        <Card>
          <CardHeader>
            <CardTitle>Workflow just failed</CardTitle>
            <CardDescription>The nightly ingest job errored out after 4 retries.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-destructive text-sm">
              <XCircle className="size-4" />
              Connection refused at 23:07:11
            </div>
            <Progress value={62} />
            <div className="flex gap-2">
              <Button size="sm">Retry</Button>
              <Button size="sm" variant="outline">
                Details
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionLabel>Form controls</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder="Search workflows…" />
          <Input placeholder="Disabled" disabled />
        </div>
        <div className="flex items-center gap-4 rounded-md border p-3">
          <Switch defaultChecked />
          <Label className="text-sm">Enable nightly runs</Label>
        </div>
      </section>

      <section className="space-y-3">
        <SectionLabel>Data palette</SectionLabel>
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
          ).map((t) => (
            <div key={t} className="space-y-1">
              <div
                className="h-10 w-full rounded-md border"
                style={{ backgroundColor: `var(--${t})` }}
              />
              <div className="text-center font-mono text-[10px] text-muted-foreground">
                {t.replace('data-', '')}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionLabel>Empty state</SectionLabel>
        <EmptyState>
          <EmptyStateIcon>
            <Zap />
          </EmptyStateIcon>
          <EmptyStateTitle>Nothing connected yet</EmptyStateTitle>
          <EmptyStateDescription>
            Add your first spark to start seeing events flow.
          </EmptyStateDescription>
        </EmptyState>
      </section>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Scene: Dashboard — cards, metrics, a table
   ───────────────────────────────────────────────────────────── */
interface MetricProps {
  label: string;
  value: string;
  delta: number;
  hint: string;
}

function Metric({ label, value, delta, hint }: Readonly<MetricProps>) {
  const up = delta >= 0;
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <div className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
          {label}
        </div>
        <div className="font-semibold text-2xl tabular-nums tracking-tight">{value}</div>
        <div className="flex items-center gap-1 text-xs">
          <span
            className={
              up
                ? 'inline-flex items-center gap-0.5 text-success'
                : 'inline-flex items-center gap-0.5 text-destructive'
            }
          >
            {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
            {Math.abs(delta)}%
          </span>
          <span className="text-muted-foreground">{hint}</span>
        </div>
      </CardContent>
    </Card>
  );
}

const RUNS = [
  {
    name: 'etl.nightly',
    status: 'success' as const,
    duration: '2m 11s',
    trigger: 'schedule',
  },
  { name: 'analytics.warm', status: 'running' as const, duration: '—', trigger: 'webhook' },
  { name: 'ingest.retry', status: 'failed' as const, duration: '43s', trigger: 'manual' },
  { name: 'notify.digest', status: 'success' as const, duration: '8s', trigger: 'schedule' },
  { name: 'billing.sync', status: 'idle' as const, duration: '—', trigger: 'schedule' },
];

const STATUS_MAP = {
  success: { icon: CheckCircle2, className: 'text-success', label: 'Succeeded' },
  running: { icon: Activity, className: 'text-primary', label: 'Running' },
  failed: { icon: XCircle, className: 'text-destructive', label: 'Failed' },
  idle: { icon: Clock, className: 'text-muted-foreground', label: 'Idle' },
} as const;

function DashboardSceneImpl() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Overview</h1>
          <p className="text-muted-foreground text-sm">Last 24h of workflow activity.</p>
        </div>
        <Button size="sm">
          <Zap /> New workflow
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Runs" value="1,284" delta={12} hint="vs yesterday" />
        <Metric label="Success" value="98.2%" delta={1} hint="rolling" />
        <Metric label="Avg. duration" value="1m 44s" delta={-3} hint="faster" />
        <Metric label="Incidents" value="2" delta={-50} hint="this week" />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Recent runs</CardTitle>
            <CardDescription>Sorted by last execution time.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <TrendingUp className="size-3" /> +12%
            </Badge>
            <Button size="sm" variant="outline">
              View all
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workflow</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Trigger</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {RUNS.map((r) => {
                const meta = STATUS_MAP[r.status];
                const Icon = meta.icon;
                return (
                  <TableRow key={r.name}>
                    <TableCell className="font-mono text-xs">{r.name}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs ${meta.className}`}
                      >
                        <Icon className="size-3.5" /> {meta.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs tabular-nums">
                      {r.duration}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal text-[10px]">
                        {r.trigger}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Storage</CardTitle>
            <CardDescription>42 GB of 100 GB used</CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={42} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Queue health</CardTitle>
            <CardDescription>Items processed last hour</CardDescription>
          </CardHeader>
          <CardContent className="flex items-end gap-1">
            {[40, 65, 55, 80, 72, 90, 75, 88, 60, 95, 70, 82].map((v, i) => (
              <div
                key={`${v}-${i}`}
                className="w-full rounded-sm bg-primary/70"
                style={{ height: `${v * 0.6}px` }}
              />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Scene: Form — auth/signup composition
   ───────────────────────────────────────────────────────────── */
function FormSceneImpl() {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="size-4" />
            </div>
            <div>
              <CardTitle>Create your workspace</CardTitle>
              <CardDescription>Start shipping in less than two minutes.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="preview-name">Workspace name</Label>
            <Input id="preview-name" defaultValue="Acme Labs" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="preview-email">Work email</Label>
            <div className="relative">
              <Mail className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="preview-email" type="email" placeholder="you@acme.com" className="pl-8" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="preview-role">Describe your role</Label>
            <Textarea
              id="preview-role"
              placeholder="What are you trying to build with Brika?"
              rows={3}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="flex items-center gap-2">
              <User className="size-4 text-muted-foreground" />
              <div className="text-sm">Invite teammates later</div>
            </div>
            <Switch defaultChecked />
          </div>
          <Button className="w-full">
            <Check /> Create workspace
          </Button>
          <p className="text-center text-muted-foreground text-xs">
            By continuing you agree to our{' '}
            <span className="cursor-pointer text-primary underline-offset-2 hover:underline">
              Terms of Service
            </span>
            .
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-4">
          <SectionLabel>People on this workspace</SectionLabel>
          {[
            { name: 'Maxime Scharwath', email: 'max@acme.com', status: 'Owner' },
            { name: 'Jamie Rivera', email: 'jamie@acme.com', status: 'Admin' },
            { name: 'Liu Chen', email: 'liu@acme.com', status: 'Member' },
          ].map((p) => (
            <div key={p.email} className="flex items-center gap-3">
              <Avatar className="size-8">
                <AvatarFallback className="bg-accent text-accent-foreground text-xs">
                  {p.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{p.name}</div>
                <div className="truncate text-muted-foreground text-xs">{p.email}</div>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {p.status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Scene: Marketing — landing-style hero + feature row
   ───────────────────────────────────────────────────────────── */
function MarketingSceneImpl() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="space-y-4 rounded-xl border bg-card p-8 shadow-sm">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1 border-primary/30 bg-primary/5 text-primary">
            <Sparkles className="size-3" /> New · v2.0
          </Badge>
          <Badge variant="secondary" className="text-[10px]">
            Beta
          </Badge>
        </div>
        <h1 className="max-w-2xl font-semibold text-4xl tracking-tight">
          Ship workflows your team actually understands.
        </h1>
        <p className="max-w-xl text-muted-foreground">
          Visual pipelines, typed events, and a sturdy SDK — wrapped in a Hub you can self-host.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="lg">
            Get started <ArrowUp className="rotate-45" />
          </Button>
          <Button size="lg" variant="outline">
            Book a demo
          </Button>
          <div className="flex items-center gap-2 pl-2 text-muted-foreground text-xs">
            <Check className="size-3.5 text-success" /> No credit card
          </div>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <div className="flex -space-x-1.5">
            {['JR', 'LC', 'MA', 'KP'].map((i) => (
              <Avatar key={i} className="size-6 border-2 border-card">
                <AvatarFallback className="bg-accent text-[9px] text-accent-foreground">
                  {i}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
          <span className="text-muted-foreground text-xs">Trusted by 1.2k builders</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          {
            icon: Zap,
            title: 'Fast by default',
            body: 'Bun-backed runtime. Cold starts under 60ms.',
            color: 'text-primary',
          },
          {
            icon: Search,
            title: 'Explorable',
            body: 'Every event is indexed and queryable live.',
            color: 'text-success',
          },
          {
            icon: Activity,
            title: 'Observable',
            body: 'Logs, metrics, and traces — all in one pane.',
            color: 'text-info',
          },
        ].map((f) => (
          <Card key={f.title}>
            <CardContent className="space-y-2 py-5">
              <div
                className={`inline-flex size-8 items-center justify-center rounded-md bg-muted ${f.color}`}
              >
                <f.icon className="size-4" />
              </div>
              <div className="font-medium text-sm">{f.title}</div>
              <div className="text-muted-foreground text-xs">{f.body}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export const ComponentsScene = memo(ComponentsSceneImpl);
export const DashboardScene = memo(DashboardSceneImpl);
export const FormScene = memo(FormSceneImpl);
export const MarketingScene = memo(MarketingSceneImpl);
