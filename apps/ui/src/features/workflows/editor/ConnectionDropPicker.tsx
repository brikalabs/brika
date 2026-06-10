/**
 * Connection Drop Picker
 *
 * Drag a wire from a port and release it on empty canvas: this picker opens
 * at the drop point listing only the blocks with a type-compatible port.
 * Picking one inserts the block pre-wired to the dragged handle.
 */

import { cn } from '@brika/clay';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@brika/clay/components/command';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useEffect, useMemo, useRef } from 'react';
import { useLocale } from '@/lib/use-locale';
import { blockDisplayName } from './block-display';
import type { CompatibleBlock } from './connection-compat';
import { toIconName } from './icon-name';

const PICKER_WIDTH = 288;
const PICKER_MAX_HEIGHT = 320;

export interface ConnectionDropPickerProps {
  /** Screen coordinates of the wire drop. */
  position: { x: number; y: number };
  candidates: CompatibleBlock[];
  onPick: (candidate: CompatibleBlock, translatedLabel: string) => void;
  onClose: () => void;
  className?: string;
}

export function ConnectionDropPicker({
  position,
  candidates,
  onPick,
  onClose,
  className,
}: Readonly<ConnectionDropPickerProps>) {
  const { t, tp } = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);

  // Clamp inside the viewport so the panel never opens half off-screen.
  const style = useMemo(() => {
    const left = Math.max(8, Math.min(position.x, window.innerWidth - PICKER_WIDTH - 8));
    const top = Math.max(8, Math.min(position.y, window.innerHeight - PICKER_MAX_HEIGHT - 8));
    return { left, top, width: PICKER_WIDTH };
  }, [position]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  const grouped = useMemo(() => {
    const categories = [...new Set(candidates.map((c) => c.block.category))].sort((a, b) =>
      a.localeCompare(b)
    );
    return categories.map((category) => ({
      category,
      label: category.charAt(0).toUpperCase() + category.slice(1),
      items: candidates.filter((c) => c.block.category === category),
    }));
  }, [candidates]);

  return (
    <>
      {/* Click-away backdrop */}
      <button
        type="button"
        aria-label={t('common:actions.close')}
        className="fixed inset-0 z-40 cursor-default bg-transparent"
        onClick={onClose}
      />
      <div
        ref={containerRef}
        className={cn(
          'fixed z-50 overflow-hidden rounded-lg border bg-popover shadow-xl',
          className
        )}
        style={style}
      >
        <Command>
          <CommandInput autoFocus placeholder={t('workflows:editor.picker.search')} />
          <CommandList style={{ maxHeight: PICKER_MAX_HEIGHT - 48 }}>
            <CommandEmpty>{t('workflows:editor.picker.noCompatible')}</CommandEmpty>
            {grouped.map((group) => (
              <CommandGroup key={group.category} heading={group.label}>
                {group.items.map((candidate) => {
                  const { block } = candidate;
                  const name = blockDisplayName(tp, block);
                  return (
                    <CommandItem
                      key={block.type || block.id}
                      value={`${name} ${block.type || block.id}`}
                      onSelect={() => onPick(candidate, name)}
                      className="gap-2"
                    >
                      <span
                        className="flex size-6 shrink-0 items-center justify-center rounded-md"
                        style={{ backgroundColor: `${block.color}20`, color: block.color }}
                      >
                        <DynamicIcon name={toIconName(block.icon)} className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{name}</span>
                      <span className="truncate font-mono text-[10px] text-muted-foreground">
                        {candidate.portName}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </div>
    </>
  );
}
