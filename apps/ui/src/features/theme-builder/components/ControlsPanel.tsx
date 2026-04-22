/**
 * ControlsPanel — the left-hand editor column.
 * Stacks a typography section, a radius section, and one color section
 * per TOKEN_GROUP. Edits merge into the draft via the supplied setter.
 */

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { MONO_FONT_CHOICES, SANS_FONT_CHOICES, TOKEN_GROUPS } from '../tokens';
import type { ColorToken, ThemeColors, ThemeConfig } from '../types';
import { ColorField } from './ColorField';
import { FontField } from './FontField';
import { RadiusField } from './RadiusField';

interface ControlsPanelProps {
  draft: ThemeConfig;
  onChange: (next: ThemeConfig) => void;
}

export function ControlsPanel({ draft, onChange }: Readonly<ControlsPanelProps>) {
  const [editingMode, setEditingMode] = useState<'light' | 'dark'>('light');

  const updateColor = (token: ColorToken, value: string) => {
    const next: ThemeColors = { ...draft.colors[editingMode], [token]: value };
    onChange({
      ...draft,
      colors: { ...draft.colors, [editingMode]: next },
    });
  };

  const updateRadius = (radius: number) => onChange({ ...draft, radius });

  const updateFontSans = (sans: string) => onChange({ ...draft, fonts: { ...draft.fonts, sans } });

  const updateFontMono = (mono: string) => onChange({ ...draft, fonts: { ...draft.fonts, mono } });

  const updateMeta = <K extends 'name' | 'description' | 'author'>(key: K, value: string) =>
    onChange({ ...draft, [key]: value });

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Meta */}
      <div className="shrink-0 space-y-2 border-b p-4">
        <input
          type="text"
          value={draft.name}
          onChange={(e) => updateMeta('name', e.target.value)}
          placeholder="Theme name"
          className="w-full bg-transparent font-semibold text-lg outline-none placeholder:text-muted-foreground/60"
        />
        <input
          type="text"
          value={draft.description ?? ''}
          onChange={(e) => updateMeta('description', e.target.value)}
          placeholder="Short description (optional)"
          className="w-full bg-transparent text-muted-foreground text-sm outline-none placeholder:text-muted-foreground/60"
        />
      </div>

      {/* Scrollable body */}
      <div className="min-h-0 flex-1 overflow-auto">
        {/* Typography */}
        <section className="space-y-4 border-b p-4">
          <div className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
            Typography
          </div>
          <FontField
            label="Sans"
            value={draft.fonts.sans}
            onChange={updateFontSans}
            choices={SANS_FONT_CHOICES}
            sample="The quick brown fox jumps over the lazy dog"
          />
          <FontField
            label="Mono"
            value={draft.fonts.mono}
            onChange={updateFontMono}
            choices={MONO_FONT_CHOICES}
            sample="const answer = 42; // life, universe, everything"
          />
        </section>

        {/* Radius */}
        <section className="space-y-4 border-b p-4">
          <div className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
            Geometry
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">Radius</span>
              <span className="font-mono text-muted-foreground text-xs">--radius</span>
            </div>
            <RadiusField value={draft.radius} onChange={updateRadius} />
          </div>
        </section>

        {/* Colors */}
        <section className="p-4">
          <Tabs value={editingMode} onValueChange={(v) => setEditingMode(v as 'light' | 'dark')}>
            <div className="flex items-center justify-between pb-3">
              <div className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                Colors
              </div>
              <TabsList className="h-7">
                <TabsTrigger value="light" className="h-6 px-2 text-xs">
                  Light
                </TabsTrigger>
                <TabsTrigger value="dark" className="h-6 px-2 text-xs">
                  Dark
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value={editingMode} className="mt-0 space-y-5">
              {TOKEN_GROUPS.map((group) => (
                <div key={group.key} className="space-y-2">
                  <div className="font-medium text-sm capitalize">{group.key}</div>
                  <div className="space-y-1.5">
                    {group.tokens.map((token) => (
                      <ColorField
                        key={token}
                        label={token}
                        value={draft.colors[editingMode][token]}
                        onChange={(v) => updateColor(token, v)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </div>
  );
}
