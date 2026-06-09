/**
 * Editor Command Palette (Cmd+K)
 *
 * One keyboard surface for everything the editor can do: insert a block,
 * jump to a node on the canvas, and run editor actions.
 */

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@brika/clay/components/command';
import type { Node } from '@xyflow/react';
import { Crosshair, Maximize2, Redo2, Undo2 } from 'lucide-react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useMemo } from 'react';
import { useLocale } from '@/lib/use-locale';
import type { BlockDefinition } from './BlockToolbar';
import { toIconName } from './icon-name';

export interface EditorCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blocks: BlockDefinition[];
  nodes: Node[];
  canUndo: boolean;
  canRedo: boolean;
  onAddBlock: (block: BlockDefinition, translatedLabel: string) => void;
  onJumpToNode: (nodeId: string) => void;
  onFitView: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function EditorCommandPalette({
  open,
  onOpenChange,
  blocks,
  nodes,
  canUndo,
  canRedo,
  onAddBlock,
  onJumpToNode,
  onFitView,
  onUndo,
  onRedo,
}: Readonly<EditorCommandPaletteProps>) {
  const { t, tp } = useLocale();

  const blockNodes = useMemo(() => nodes.filter((n) => n.type === 'block'), [nodes]);

  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command>
        <CommandInput autoFocus placeholder={t('workflows:editor.palette.placeholder')} />
        <CommandList>
          <CommandEmpty>{t('workflows:editor.palette.noResults')}</CommandEmpty>

          <CommandGroup heading={t('workflows:editor.palette.addBlock')}>
            {blocks.map((block) => {
              const blockKey = block.id.split(':').pop() || block.id;
              const name = tp(block.pluginId, `blocks.${blockKey}.name`, block.name || blockKey);
              return (
                <CommandItem
                  key={`add:${block.type || block.id}`}
                  value={`add ${name} ${block.type || block.id} ${block.category}`}
                  onSelect={() => run(() => onAddBlock(block, name))}
                  className="gap-2"
                >
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-md"
                    style={{ backgroundColor: `${block.color}20`, color: block.color }}
                  >
                    <DynamicIcon name={toIconName(block.icon)} className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  <span className="text-[10px] text-muted-foreground uppercase">
                    {block.category}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>

          {blockNodes.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={t('workflows:editor.palette.goToBlock')}>
                {blockNodes.map((node) => {
                  const label = typeof node.data.label === 'string' ? node.data.label : node.id;
                  return (
                    <CommandItem
                      key={`node:${node.id}`}
                      value={`go ${label} ${node.id}`}
                      onSelect={() => run(() => onJumpToNode(node.id))}
                      className="gap-2"
                    >
                      <Crosshair className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          )}

          <CommandSeparator />
          <CommandGroup heading={t('workflows:editor.palette.actions')}>
            <CommandItem value="fit view zoom" onSelect={() => run(onFitView)} className="gap-2">
              <Maximize2 className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1">{t('workflows:editor.palette.fitView')}</span>
            </CommandItem>
            <CommandItem
              value="undo"
              disabled={!canUndo}
              onSelect={() => run(onUndo)}
              className="gap-2"
            >
              <Undo2 className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1">{t('workflows:editor.palette.undo')}</span>
              <CommandShortcut>⌘Z</CommandShortcut>
            </CommandItem>
            <CommandItem
              value="redo"
              disabled={!canRedo}
              onSelect={() => run(onRedo)}
              className="gap-2"
            >
              <Redo2 className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1">{t('workflows:editor.palette.redo')}</span>
              <CommandShortcut>⇧⌘Z</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
