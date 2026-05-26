import { Button } from '@brika/sdk/ui-kit';
import { Check, FolderPlus, Loader2, X } from '@brika/sdk/ui-kit/icons';
import { type ChangeEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';

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
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="folder name"
        disabled={creating}
        className="min-w-0 flex-1 bg-transparent font-medium text-sm outline-none placeholder:font-normal placeholder:text-muted-foreground disabled:opacity-50"
      />
      <kbd className="hidden font-mono text-[10px] text-muted-foreground/70 sm:inline">
        ↵ to create · esc to cancel
      </kbd>
      <Button
        variant="default"
        size="icon-xs"
        onClick={submit}
        disabled={!canSubmit}
        title="Create folder (Enter)"
      >
        {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onCancel}
        disabled={creating}
        title="Cancel (Esc)"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
