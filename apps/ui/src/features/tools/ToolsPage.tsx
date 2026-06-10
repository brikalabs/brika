/**
 * Tools registry page: every hub-registered tool (the AI-callable capability
 * surface), grouped by owning plugin, with each tool's parameters. The sibling
 * of the Sparks and Blocks registry pages.
 */

import {
  Avatar,
  AvatarFallback,
  Badge,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@brika/clay';
import { Search, Wrench } from 'lucide-react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useMemo, useState } from 'react';
import { useLocale } from '@/lib/use-locale';
import { toIconName } from '../workflows/editor/icon-name';
import { splitToolId, type ToolSummary, useTools } from './api';

function toolParameters(tool: ToolSummary): string[] {
  return Object.keys(tool.inputSchema?.properties ?? {});
}

function ToolCard({ tool }: Readonly<{ tool: ToolSummary }>) {
  const { name } = splitToolId(tool.id);
  const parameters = toolParameters(tool);
  const color = tool.color || '#6b7280';

  return (
    <div className="flex items-start gap-3 rounded-lg bg-muted/30 p-3 transition-colors hover:bg-muted/50">
      <Avatar className="size-10 shrink-0" style={{ backgroundColor: `${color}20` }}>
        <AvatarFallback style={{ backgroundColor: `${color}20`, color }}>
          <DynamicIcon name={toIconName(tool.icon, 'wrench')} className="size-5" />
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium font-mono text-sm">{name}</div>
        {tool.description && (
          <div className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
            {tool.description}
          </div>
        )}
        {parameters.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {parameters.map((parameter) => (
              <Badge
                key={parameter}
                variant="outline"
                className="px-1.5 py-0 font-mono text-[10px]"
              >
                {parameter}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ToolsPage() {
  const { t } = useLocale();
  const { data: tools = [], isLoading } = useTools();
  const [search, setSearch] = useState('');

  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? tools.filter(
          (tool) =>
            tool.id.toLowerCase().includes(query) ||
            (tool.description ?? '').toLowerCase().includes(query)
        )
      : tools;
    const byPlugin = new Map<string, ToolSummary[]>();
    for (const tool of filtered) {
      const { plugin } = splitToolId(tool.id);
      const list = byPlugin.get(plugin) ?? [];
      list.push(tool);
      byPlugin.set(plugin, list);
    }
    return [...byPlugin.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [tools, search]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-bold text-2xl">
            <Wrench className="size-6 text-primary" />
            {t('tools:title')}
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">{t('tools:description')}</p>
        </div>
        <InputGroup className="h-9 w-72 bg-background">
          <InputGroupAddon>
            <Search className="size-4" />
          </InputGroupAddon>
          <InputGroupInput
            placeholder={t('tools:search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
      </div>

      {!isLoading && groups.length === 0 && (
        <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <Wrench className="mx-auto mb-3 size-8 opacity-40" />
          <p className="text-sm">{search ? t('tools:noResults') : t('tools:empty')}</p>
        </div>
      )}

      {groups.map(([plugin, pluginTools]) => (
        <section key={plugin}>
          <div className="mb-2 flex items-center gap-2">
            <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              {plugin}
            </h2>
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              {pluginTools.length}
            </Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pluginTools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
