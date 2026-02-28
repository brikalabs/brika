import { Scope } from '@brika/auth';
import { page } from './page';

export const workflowRoutes = {
  list: page({ path: '/workflows', load: () => import('@/features/workflows'), select: (m) => m.WorkflowsPage, scopes: Scope.WORKFLOW_READ }),
  new: page({ path: '/workflows/new', load: () => import('@/features/workflows'), select: (m) => m.WorkflowEditorPage, scopes: Scope.WORKFLOW_WRITE }),
  edit: page({ path: '/workflows/$id/edit', load: () => import('@/features/workflows'), select: (m) => m.WorkflowEditorPage, scopes: Scope.WORKFLOW_WRITE }),
};
