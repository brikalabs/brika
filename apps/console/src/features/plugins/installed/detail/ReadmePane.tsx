import { ScrollArea } from '@brika/tui';
import { Text } from 'ink';
import type React from 'react';
import { MarkdownStream } from '../../../../shared/components/MarkdownStream';

interface ReadmePaneProps {
  readonly hasFocus: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly text: string | null;
  /** Plugin uid — used as the `<ScrollArea>` key so the scroll
   *  position resets when the user picks a different plugin. */
  readonly uid: string | null;
}

export function ReadmePane({
  hasFocus,
  loading,
  error,
  text,
  uid,
}: Readonly<ReadmePaneProps>): React.ReactElement {
  if (!hasFocus) {
    return <Text dimColor>(select a plugin)</Text>;
  }
  if (loading) {
    return <Text dimColor>loading readme…</Text>;
  }
  if (error) {
    return <Text color="red">{error}</Text>;
  }
  if (!text) {
    return <Text dimColor>no readme</Text>;
  }
  return (
    <ScrollArea key={uid ?? 'no-uid'} id={`readme-${uid ?? 'none'}`} autoFocus>
      <MarkdownStream source={text} />
    </ScrollArea>
  );
}
