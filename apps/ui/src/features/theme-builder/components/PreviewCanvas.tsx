/**
 * PreviewCanvas — renders sample components inside a scoped container
 * with the pending theme's CSS variables inlined. Changes are visible
 * immediately without affecting the rest of the app.
 *
 * Toggle between light and dark modes locally so the author can
 * inspect both palettes without switching the global theme.
 */

import { AlertTriangle, CheckCircle2, Info, Moon, Sun, XCircle, Zap } from 'lucide-react';
import { type CSSProperties, useMemo, useState } from 'react';
import {
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
  Progress,
  SectionLabel,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import type { ColorToken, ThemeColors, ThemeConfig } from '../types';

function paletteToStyle(colors: ThemeColors): CSSProperties {
  const style: Record<string, string> = {};
  for (const [token, value] of Object.entries(colors) as Array<[ColorToken, string]>) {
    style[`--${token}`] = value;
  }
  return style as CSSProperties;
}

function themeToStyle(theme: ThemeConfig, mode: 'light' | 'dark'): CSSProperties {
  return {
    ...paletteToStyle(theme.colors[mode]),
    '--radius': `${theme.radius}rem`,
    '--font-sans': theme.fonts.sans,
    '--font-mono': theme.fonts.mono,
    fontFamily: 'var(--font-sans)',
  } as CSSProperties;
}

interface PreviewCanvasProps {
  theme: ThemeConfig;
}

export function PreviewCanvas({ theme }: Readonly<PreviewCanvasProps>) {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const style = useMemo(() => themeToStyle(theme, mode), [theme, mode]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
        <span className="font-medium text-sm">Preview</span>
        <div className="flex gap-1 rounded-md border p-0.5">
          <button
            type="button"
            onClick={() => setMode('light')}
            className={cn(
              'flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors',
              mode === 'light'
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Sun className="size-3" />
            Light
          </button>
          <button
            type="button"
            onClick={() => setMode('dark')}
            className={cn(
              'flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors',
              mode === 'dark'
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Moon className="size-3" />
            Dark
          </button>
        </div>
      </div>

      <div
        data-preview="true"
        className={cn(
          'min-h-0 flex-1 overflow-auto bg-background p-6 text-foreground',
          mode === 'dark' && 'dark'
        )}
        style={style}
      >
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Typography */}
          <section className="space-y-2">
            <h1 className="font-semibold text-2xl tracking-tight">Typography</h1>
            <p className="text-muted-foreground text-sm">
              The quick brown fox jumps over the lazy dog. 0123456789.
            </p>
            <code className="inline-block rounded-md bg-muted px-2 py-1 font-mono text-xs">
              const brika = () =&gt; &#123; theme: &apos;custom&apos; &#125;;
            </code>
          </section>

          {/* Buttons */}
          <section className="space-y-3">
            <SectionLabel>Buttons</SectionLabel>
            <div className="flex flex-wrap gap-2">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
            </div>
          </section>

          {/* Badges */}
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

          {/* Card */}
          <section className="space-y-3">
            <SectionLabel>Card</SectionLabel>
            <Card>
              <CardHeader>
                <CardTitle>Workflow just failed</CardTitle>
                <CardDescription>
                  The nightly ingest job errored out after 4 retries.
                </CardDescription>
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

          {/* Input */}
          <section className="space-y-3">
            <SectionLabel>Input</SectionLabel>
            <div className="space-y-2">
              <Input placeholder="Search workflows…" />
              <Input placeholder="Disabled" disabled />
            </div>
          </section>

          {/* Data viz */}
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

          {/* Empty state */}
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
      </div>
    </div>
  );
}
