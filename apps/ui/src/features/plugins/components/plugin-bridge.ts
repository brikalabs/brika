import * as LucideIcons from 'lucide-react';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as UIComponents from '@/components/ui';
import { pluginCallAction, usePluginAction, usePluginLocale } from './plugin-hooks';

declare global {
  // eslint-disable-next-line no-var
  var __brika:
    | {
        React: typeof React;
        jsx: typeof jsxRuntime;
        ui: typeof UIComponents;
        icons: typeof LucideIcons;
        hooks: {
          useLocale: typeof usePluginLocale;
          useAction: typeof usePluginAction;
          callAction: typeof pluginCallAction;
        };
      }
    | undefined;
}

globalThis.__brika ??= {
  React,
  jsx: jsxRuntime,
  ui: UIComponents,
  icons: LucideIcons,
  hooks: { useLocale: usePluginLocale, useAction: usePluginAction, callAction: pluginCallAction },
};
