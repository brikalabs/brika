import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Spinner,
} from '@brika/sdk/ui-kit';
import { useLocale } from '@brika/sdk/ui-kit/hooks';
import { FolderPlus } from '@brika/sdk/ui-kit/icons';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

interface NewFolderInputProps {
  creating: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

export function NewFolderInput({ creating, onSubmit, onCancel }: Readonly<NewFolderInputProps>) {
  const { t } = useLocale();
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
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <FolderPlus className="text-muted-foreground" />
      </InputGroupAddon>
      <InputGroupInput
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('fileBrowser.newFolder.placeholder')}
        disabled={creating}
        aria-label={t('fileBrowser.newFolder.ariaLabel')}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="xs" onClick={onCancel} disabled={creating}>
          {t('fileBrowser.actions.cancel')}
        </InputGroupButton>
        <InputGroupButton size="xs" variant="default" onClick={submit} disabled={!canSubmit}>
          {creating && <Spinner size="sm" />}
          {t('fileBrowser.newFolder.create')}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
