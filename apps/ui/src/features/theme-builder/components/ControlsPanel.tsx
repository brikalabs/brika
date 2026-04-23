/**
 * ControlsPanel — the editor column.
 *
 * Top-level tabs split content so each half has its full height:
 *   • Design tab  — Typography / Geometry / Spacing / Effects / Atmosphere
 *   • Palette tab — the color tokens with search + sync utilities
 */

import { Palette as PaletteIcon, Sliders } from 'lucide-react';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import type { ThemeConfig } from '../types';
import { DesignTab } from './DesignTab';
import { MetaHeader } from './MetaHeader';
import { PaletteTab } from './PaletteTab';

interface ControlsPanelProps {
  draft: ThemeConfig;
  onChange: (next: ThemeConfig) => void;
}

export function ControlsPanel({ draft, onChange }: Readonly<ControlsPanelProps>) {
  const [tab, setTab] = useState<'design' | 'palette'>('design');

  const patch = <K extends keyof ThemeConfig>(key: K, value: ThemeConfig[K]) =>
    onChange({ ...draft, [key]: value });

  const updateFontSans = (sans: string) => onChange({ ...draft, fonts: { ...draft.fonts, sans } });
  const updateFontMono = (mono: string) => onChange({ ...draft, fonts: { ...draft.fonts, mono } });
  const updateMeta = (key: 'name' | 'description' | 'author', value: string) =>
    onChange({ ...draft, [key]: value });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MetaHeader draft={draft} onChange={updateMeta} />

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v === 'palette' ? 'palette' : 'design')}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="mx-3 mt-2 grid shrink-0 grid-cols-2">
          <TabsTrigger value="design" className="gap-1.5 text-xs">
            <Sliders className="size-3.5" />
            Design
          </TabsTrigger>
          <TabsTrigger value="palette" className="gap-1.5 text-xs">
            <PaletteIcon className="size-3.5" />
            Palette
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="design"
          className="mt-2 min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden"
        >
          <DesignTab
            draft={draft}
            patch={patch}
            onChange={onChange}
            onFontSansChange={updateFontSans}
            onFontMonoChange={updateFontMono}
          />
        </TabsContent>

        <TabsContent
          value="palette"
          className="mt-2 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
        >
          <PaletteTab draft={draft} onChange={onChange} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
