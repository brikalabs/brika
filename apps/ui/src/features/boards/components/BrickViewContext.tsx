import { createContext } from 'react';

export interface BrickViewContextValue {
  instanceId: string;
  brickTypeId: string;
  pluginName: string;
  pluginUid: string;
  config: Record<string, unknown>;
  size: { w: number; h: number };
}

export const BrickViewContext = createContext<BrickViewContextValue | null>(null);
