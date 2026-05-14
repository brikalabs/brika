/**
 * Playground — a tiny interactive sandbox for trying out hot reload.
 * Press `+` / `-` to change the counter, `r` to reset. Edit anything
 * in this file (button labels, colors, the count expression) and
 * save — your changes should land in the live tree with the counter
 * value intact. Ink has no native buttons; the "buttons" below are
 * styled Box/Text pairs that show which key triggers what.
 */

import { useKey } from '@brika/tui';
import { Box, Text } from 'ink';
import { useState, type ReactElement } from 'react';

export function PlaygroundView(): ReactElement {
  const [count, setCount] = useState(0);

  useKey('+', () => setCount((n) => n + 1));
  useKey('=', () => setCount((n) => n + 1)); // `=` is `+` without shift on most layouts
  useKey('-', () => setCount((n) => n - 1));
  useKey('r', () => setCount(0));

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Playground</Text>
      </Box>

      <Box
        borderStyle="round"
        borderColor="cyan"
        paddingX={2}
        paddingY={1}
        flexDirection="column"
        alignItems="center"
      >
        <Text dimColor>counters</Text>
        <Text bold color="cyan">
          {count}
        </Text>
      </Box>

      <Box marginTop={1} gap={2}>
        <Button label="+ increment" hotkey="+" />
        <Button label="− decrement" hotkey="-" />
        <Button label="↺ reset" hotkey="r" />
      </Box>

      <Box marginTop={2} flexDirection="column">
        <Text dimColor>
          Edit <Text color="magenta">src/tui/views/PlaygroundView.tsx</Text> and save.
        </Text>
        <Text dimColor>Counter state survives hot reload.</Text>
      </Box>
    </Box>
  );
}

interface ButtonProps {
  readonly label: string;
  readonly hotkey: string;
}

function Button({ label, hotkey }: Readonly<ButtonProps>): ReactElement {
  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1}>
      <Text>
        <Text color="yellow">[{hotkey}]</Text> <Text>{label}</Text>
      </Text>
    </Box>
  );
}
