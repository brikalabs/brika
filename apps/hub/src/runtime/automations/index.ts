export { AutomationEngine } from './automation-engine';
export type { BlockConnection, Workflow, WorkflowBlock } from './types';
export type {
  ExecutionEvent,
  ExecutionListener,
  ExecutorDeps,
  PortBuffer,
} from './workflow-executor';
export { WorkflowExecutor } from './workflow-executor';
// Legacy alias
export { WorkflowLoader, WorkflowLoader as YamlWorkflowLoader } from './workflow-loader';
