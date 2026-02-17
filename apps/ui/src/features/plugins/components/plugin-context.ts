import { createContext } from 'react';

export interface PluginContextValue {
  uid: string;
  namespace: string;
}

export const PluginContext = createContext<PluginContextValue>({ uid: '', namespace: '' });
