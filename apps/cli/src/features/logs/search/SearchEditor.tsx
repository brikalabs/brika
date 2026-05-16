import { Input } from '@brika/tui';
import { Box } from 'ink';
import type React from 'react';

interface SearchEditorProps {
  readonly draft: string;
  readonly setDraft: (next: string) => void;
  readonly onSubmit: (value: string) => void;
  readonly onCancel: () => void;
}

export function SearchEditor({
  draft,
  setDraft,
  onSubmit,
  onCancel,
}: Readonly<SearchEditorProps>): React.ReactElement {
  return (
    <Box flexShrink={0} marginTop={1}>
      <Input
        type="search"
        value={draft}
        onChange={setDraft}
        onSubmit={(value) => {
          setDraft(value);
          onSubmit(value);
        }}
        onCancel={onCancel}
        placeholder="search — Enter to commit, Esc to cancel"
        accentColor="cyan"
        flex
      />
    </Box>
  );
}
