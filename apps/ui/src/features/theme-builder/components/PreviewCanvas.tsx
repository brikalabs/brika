/**
 * PreviewCanvas — renders sample scenes inside a scoped container
 * with the pending theme's CSS variables inlined. Changes are visible
 * immediately without affecting the rest of the app.
 */

import { Layout, LayoutDashboard, Moon, Sparkles, SquarePen, Sun } from 'lucide-react';
import { type CSSProperties, useMemo, useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui';
import { cn } from '@/lib/utils';
import { type ThemeVars, themeToVars } from '../theme-css';
import type { ThemeConfig } from '../types';
import { ComponentsScene, DashboardScene, FormScene, MarketingScene } from './preview-scenes';

type SceneId = 'components' | 'dashboard' | 'form' | 'marketing';

const SCENES: { id: SceneId; label: string; icon: typeof Sun }[] = [
  { id: 'components', label: 'Components', icon: Layout },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'form', label: 'Form', icon: SquarePen },
  { id: 'marketing', label: 'Marketing', icon: Sparkles },
];

// React's CSSProperties doesn't declare CSS custom properties (`--foo`),
// but they're valid in the `style` prop. Intersect so extra vars pass the
// type check without any assertion.
type StyleWithVars = CSSProperties & ThemeVars;

function themeToStyle(theme: ThemeConfig, mode: 'light' | 'dark'): StyleWithVars {
  return { ...themeToVars(theme, mode), fontFamily: 'var(--font-sans)' };
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
      <div className="flex shrink-0 items-center justify-between gap-2 border-b py-2 pl-3 pr-safe">
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

        <Tabs value={mode} onValueChange={(v) => setMode(v === 'dark' ? 'dark' : 'light')}>
          <TabsList className="h-8">
            <TabsTrigger value="light" className="h-7 gap-1 px-2 text-xs">
              <Sun className="size-3" /> Light
            </TabsTrigger>
            <TabsTrigger value="dark" className="h-7 gap-1 px-2 text-xs">
              <Moon className="size-3" /> Dark
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div
        data-preview="true"
        className={cn(
          'min-h-0 flex-1 overflow-auto bg-background p-safe text-foreground',
          mode === 'dark' && 'dark'
        )}
        style={style}
      >
        <SceneContent scene={scene} />
      </div>
    </div>
  );
}
