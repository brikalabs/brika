import { Text } from 'ink';
import type React from 'react';
import type { LogEventDto } from '../../shared/cli/api';
import { levelColor } from './format';

export function ColoredLogLine({
  event,
}: Readonly<{ event: LogEventDto }>): React.ReactElement {
  const ts = new Date(event.ts).toISOString().slice(11, 19);
  const level = event.level.padEnd(5);
  const source = (event.pluginName ? `${event.source}/${event.pluginName}` : event.source).padEnd(
    20
  );
  return (
    <>
      <Text dimColor>{ts}</Text>
      <Text>{'  '}</Text>
      <Text color={levelColor(event.level)} bold>
        {level}
      </Text>
      <Text> </Text>
      <Text color="cyan" dimColor>
        {source}
      </Text>
      <Text> {event.message}</Text>
    </>
  );
}
