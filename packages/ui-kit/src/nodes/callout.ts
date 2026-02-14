import type { BaseNode } from './_shared';

export interface CalloutNode extends BaseNode {
  type: 'callout';
  /** Semantic variant controlling color and icon */
  variant: 'info' | 'warning' | 'error' | 'success';
  /** Main message text */
  message: string;
  /** Optional title */
  title?: string;
  /** Override the default icon (Lucide icon name) */
  icon?: string;
}

export function Callout(props: Omit<CalloutNode, 'type'>): CalloutNode {
  return { type: 'callout', ...props };
}

declare module './_shared' {
  interface NodeTypeMap {
    callout: CalloutNode;
  }
}
