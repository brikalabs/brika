import type { ComponentMeta } from '../_registry';

export const meta: ComponentMeta = {
  name: 'toast',
  displayName: 'Toast',
  group: 'Feedback',
  description: `Transient notification surface. Wrap the app in <ToastProvider>, place a <Toaster /> at the edge, and render <Toast> instances on demand.`,
};
