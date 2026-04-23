/**
 * PreviewCanvas — renders sample scenes inside a scoped container
 * with the pending theme's CSS variables inlined. Changes are visible
 * immediately without affecting the rest of the app.
 */

import { Layout, LayoutDashboard, Moon, Sparkles, SquarePen, Sun } from 'lucide-react';
import { type CSSProperties, useMemo, useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui';
import { cn } from '@/lib/utils';
import { cornerShapeKeyword } from '../corner-css';
import { collectTokens, tokensToCssProperties } from '../theme-css';
import type { ThemeConfig } from '../types';
import { ComponentsScene, DashboardScene, FormScene, MarketingScene } from './preview-scenes';

type SceneId = 'components' | 'dashboard' | 'form' | 'marketing';

const SCENES: { id: SceneId; label: string; icon: typeof Sun }[] = [
  { id: 'components', label: 'Components', icon: Layout },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'form', label: 'Form', icon: SquarePen },
  { id: 'marketing', label: 'Marketing', icon: Sparkles },
];

function themeToStyle(theme: ThemeConfig, mode: 'light' | 'dark'): CSSProperties {
  const tokens = tokensToCssProperties(collectTokens(theme, mode));
  // `corner-shape` isn't in React's CSSProperties typings yet, but works
  // fine when set via the `style` prop. Passing via a record cast avoids
  // the typing gap while keeping everything else strongly typed.
  const style: Record<string, string> = {
    ...(tokens as Record<string, string>),
    fontFamily: 'var(--font-sans)',
    cornerShape: cornerShapeKeyword(theme.corners),
  };
  return style;
}

function SceneContent({ scene }: Readonly<{ scene: SceneId }>) {
  switch (scene) {
    case 'dashboard':
      return <DashboardScene />;
    case 'form':
      return <FormScene />;
    case 'marketing':
      return <MarketingScene />;
    default:
      return <ComponentsScene />;
  }
}

interface PreviewCanvasProps {
  theme: ThemeConfig;
}

export function PreviewCanvas({ theme }: Readonly<PreviewCanvasProps>) {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const [scene, setScene] = useState<SceneId>('components');
  const style = useMemo(() => themeToStyle(theme, mode), [theme, mode]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <Tabs value={scene} onValueChange={(v) => setScene(v as SceneId)}>
          <TabsList className="h-8">
            {SCENES.map(({ id, label, icon: Icon }) => (
              <TabsTrigger key={id} value={id} className="h-7 gap-1 px-2 text-xs">
                <Icon className="size-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex gap-1 rounded-control border p-0.5">
          <button
            type="button"
            onClick={() => setMode('light')}
            className={cn(
              'flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs transition-colors',
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
              'flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs transition-colors',
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
        <SceneContent scene={scene} />
      </div>
    </div>
  );
}
