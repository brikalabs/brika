/**
 * PreviewCanvas — renders the selected scene inside a `ThemedSurface`
 * so the preview pane reads the draft theme without polluting the rest
 * of the app.
 */

import { Tabs, TabsList, TabsTrigger } from '@brika/clay';
import { Layout, LayoutDashboard, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ThemeConfig } from '../types';
import { AppScene, LibraryScene } from './preview-scenes';
import { ThemedSurface } from './ThemedSurface';

type SceneId = 'library' | 'app';

const SCENES: { id: SceneId; icon: typeof Sun }[] = [
  { id: 'library', icon: Layout },
  { id: 'app', icon: LayoutDashboard },
];

function SceneContent({ scene }: Readonly<{ scene: SceneId }>) {
  return scene === 'app' ? <AppScene /> : <LibraryScene />;
}

interface PreviewCanvasProps {
  theme: ThemeConfig;
}

export function PreviewCanvas({ theme }: Readonly<PreviewCanvasProps>) {
  const { t } = useTranslation('themeBuilder');
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const [scene, setScene] = useState<SceneId>('library');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b py-2 pr-safe pl-3">
        <Tabs value={scene} onValueChange={(v) => setScene(v as SceneId)}>
          <TabsList className="h-8">
            {SCENES.map(({ id, icon: Icon }) => (
              <TabsTrigger key={id} value={id} className="h-7 gap-1 px-2 text-xs">
                <Icon className="size-3.5" />
                <span className="hidden sm:inline">{t(`preview.scenes.${id}`)}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Tabs value={mode} onValueChange={(v) => setMode(v === 'dark' ? 'dark' : 'light')}>
          <TabsList className="h-8">
            <TabsTrigger value="light" className="h-7 gap-1 px-2 text-xs">
              <Sun className="size-3" /> {t('preview.modeLight')}
            </TabsTrigger>
            <TabsTrigger value="dark" className="h-7 gap-1 px-2 text-xs">
              <Moon className="size-3" /> {t('preview.modeDark')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ThemedSurface
        theme={theme}
        mode={mode}
        variant="canvas"
        className="min-h-0 flex-1 overflow-auto p-safe"
      >
        <SceneContent scene={scene} />
      </ThemedSurface>
    </div>
  );
}
