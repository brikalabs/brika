import {
  type ActionHandler,
  type BaseNode,
  type Child,
  type ComponentNode,
  normalizeChildren,
  resolveAction,
} from './_shared';

export interface TabItem {
  key: string;
  label: string;
  icon?: string;
  children: ComponentNode[];
}

export interface TabsNode extends BaseNode {
  type: 'tabs';
  /** Currently active tab key */
  value: string;
  tabs: TabItem[];
  /** Action dispatched when tab changes */
  onChange: string;
  /** Visual style */
  variant?: 'default' | 'pills';
}

export function Tabs(props: {
  value: string;
  tabs: { key: string; label: string; icon?: string; children?: Child | Child[] }[];
  onChange: ActionHandler;
  variant?: 'default' | 'pills';
}): TabsNode {
  const { tabs, onChange, ...rest } = props;
  return {
    type: 'tabs',
    ...rest,
    tabs: tabs.map((tab) => ({
      key: tab.key,
      label: tab.label,
      icon: tab.icon,
      children: normalizeChildren(tab.children),
    })),
    onChange: resolveAction(onChange),
  };
}

declare module './_shared' {
  interface NodeTypeMap {
    tabs: TabsNode;
  }
}
