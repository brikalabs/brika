import {
  Button,
  Input,
  Kbd,
  KbdGroup,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@brika/sdk/ui-kit';
import { Check, FolderPlus, X } from '@brika/sdk/ui-kit/icons';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

interface NewFolderInputProps {
  creating: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

export function NewFolderInput({ creating, onSubmit, onCancel }: Readonly<NewFolderInputProps>) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit() {
    const trimmed = name.trim();
    if (trimmed) {
      onSubmit(trimmed);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      submit();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  }

  const canSubmit = !creating && name.trim().length > 0;

  return (
    <div className="flex items-center gap-3 bg-primary/[0.04] px-3 py-2">
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/15"
      >
        <FolderPlus className="size-4 text-primary" />
      </span>
      <Input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="folder name"
        disabled={creating}
        className="min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
      />
      <KbdGroup className="hidden sm:inline-flex" aria-label="Keyboard shortcuts">
        <Kbd>↵</Kbd>
        <span className="text-muted-foreground/70 text-xs">to create</span>
        <Kbd>esc</Kbd>
        <span className="text-muted-foreground/70 text-xs">to cancel</span>
      </KbdGroup>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="default" size="icon-xs" onClick={submit} disabled={!canSubmit}>
            {creating ? <Spinner size="sm" /> : <Check className="size-3.5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Create folder (Enter)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-xs" onClick={onCancel} disabled={creating}>
            <X className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Cancel (Esc)</TooltipContent>
      </Tooltip>
    </div>
  );
}
