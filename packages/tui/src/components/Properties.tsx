/**
 * `<Properties>` — vertical list of key/value rows, auto-aligned.
 *
 *   <Properties>
 *     <Property name="BRIKA_HOME">{cli.workspace}</Property>
 *     <Property name="version">v{cli.version}</Property>
 *     <Property name="runtime">{`Bun ${Bun.version}`}</Property>
 *   </Properties>
 *
 * The parent measures the longest `name` and pins every label
 * column to that width so values line up without each consumer
 * fiddling with `<Box width={…}>`. Looks like a terminal `dl` /
 * `<dt>`/`<dd>` pair without the verbose markup.
 *
 * Composition lines up with shadcn's family pattern — title and
 * value are in their own slots and the parent owns layout. The
 * label is `<Property name=…>` rather than children so the parent
 * can measure it at registration time (children are React nodes,
 * the name needs to be a string for width math).
 */

import { Box, Text } from 'ink';
import type React from 'react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

interface PropertiesContextValue {
  readonly columnWidth: number;
  readonly register: (name: string) => () => void;
}

const PropertiesContext = createContext<PropertiesContextValue | null>(null);

function usePropertiesContext(component: string): PropertiesContextValue {
  const ctx = useContext(PropertiesContext);
  if (!ctx) {
    throw new Error(`<${component}> must be rendered inside a <Properties>`);
  }
  return ctx;
}

export interface PropertiesProps {
  /** Minimum column width for the label. Default 1 (auto-grow). */
  readonly minLabelWidth?: number;
  /** Cap on the label column width so a stray long key doesn't push
   *  every value far to the right. Default 24. */
  readonly maxLabelWidth?: number;
  readonly children?: ReactNode;
}

export function Properties({
  minLabelWidth = 1,
  maxLabelWidth = 24,
  children,
}: Readonly<PropertiesProps>): React.ReactElement {
  const [names, setNames] = useState<ReadonlyArray<string>>([]);

  const register = useCallback((name: string): (() => void) => {
    setNames((prev) => (prev.includes(name) ? prev : [...prev, name]));
    const isOther = (n: string): boolean => n !== name;
    return () => setNames((prev) => prev.filter(isOther));
  }, []);

  const columnWidth = useMemo(() => {
    const longest = names.reduce((w, n) => Math.max(w, n.length), 0);
    return Math.max(minLabelWidth, Math.min(maxLabelWidth, longest));
  }, [names, minLabelWidth, maxLabelWidth]);

  const ctx = useMemo<PropertiesContextValue>(
    () => ({ columnWidth, register }),
    [columnWidth, register]
  );

  return (
    <PropertiesContext.Provider value={ctx}>
      <Box flexDirection="column">{children}</Box>
    </PropertiesContext.Provider>
  );
}

export interface PropertyProps {
  /** Label text (also serves as the React key for ordering). */
  readonly name: string;
  /** Value rendered to the right of the label. `string` lands as
   *  plain text; arbitrary nodes pass through (e.g. a `<Badge>` for
   *  a status row). */
  readonly children?: ReactNode;
}

export function Property({ name, children }: Readonly<PropertyProps>): React.ReactElement {
  const { columnWidth, register } = usePropertiesContext('Property');
  useEffect(() => register(name), [register, name]);
  return (
    <Box>
      <Box width={columnWidth + 2}>
        <Text dimColor>{name}</Text>
      </Box>
      {typeof children === 'string' ? <Text>{children}</Text> : children}
    </Box>
  );
}
